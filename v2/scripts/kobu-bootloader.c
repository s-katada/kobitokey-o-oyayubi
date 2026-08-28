// kobu-bootloader — drop a USB-connected kobu2 into the UF2 bootloader without
// pressing RESET twice.
//
// Sends the Via `BootloaderJump` command (0x0B, rmk-types-0.2.2
// protocol/vial.rs:26) to the Vial raw-HID interface (usage page 0xFF60 /
// usage 0x61). rmk-0.8.2 host/via/mod.rs:354 handles it through
// boot::jump_to_bootloader(); with the `adafruit_bl` feature that writes
// GPREGRET=0x57 and issues a system reset — exactly what a RESET double-tap
// does. It is unrelated to the Vial unlock chord (no lock check on this path).
//
// Build:
//   cc -O2 -framework IOKit -framework CoreFoundation -o kobu-bootloader kobu-bootloader.c
//
// ⚠ Vial raw HID is reachable over USB only — see the [host] note in
//   keyboard.toml ("BLE-only sessions cannot edit keymap"). Plug the LEFT half
//   (central) in with a DATA cable first; over BLE this tool has nothing to
//   talk to.
// ⚠ macOS mounts the bootloader as /Volumes/XIAO-SENSE, not XIAO-BOOT. Detect
//   it by the presence of INFO_UF2.TXT, never by name.
//
// `--dump-combos` reads the LIVE combo table back out of the running firmware
// (Vial DynamicEntryOp/ComboGet, 0xFE 0x0D 0x03 <idx>; reply = return code +
// 4 input keycodes + 1 output keycode, all LE u16 — rmk-0.8.2
// host/via/vial.rs:392). That is the only way to prove what is actually in
// flash: rmk OVERLAYS stored combo slots over the compiled keyboard.toml at
// boot, so a plain reflash can silently keep the old table.

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDManager.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define KOBU_VID            0x4b4f
#define KOBU_PID            0x425a
#define VIAL_USAGE_PAGE     0xff60
#define VIAL_USAGE          0x61
#define VIA_BOOTLOADER_JUMP 0x0b
#define VIA_REPORT_LEN      32
#define VIA_CMD_VIAL              0xfe
#define VIAL_DYNAMIC_ENTRY_OP     0x0d
#define VIAL_GET_NUMBER_OF_ENTRIES 0x00
#define VIAL_COMBO_GET            0x03

static long get_long(IOHIDDeviceRef d, CFStringRef key) {
    CFTypeRef v = IOHIDDeviceGetProperty(d, key);
    long out = -1;
    if (v && CFGetTypeID(v) == CFNumberGetTypeID())
        CFNumberGetValue((CFNumberRef)v, kCFNumberLongType, &out);
    return out;
}

static void get_str(IOHIDDeviceRef d, CFStringRef key, char *buf, size_t n) {
    buf[0] = '\0';
    CFTypeRef v = IOHIDDeviceGetProperty(d, key);
    if (v && CFGetTypeID(v) == CFStringGetTypeID())
        CFStringGetCString((CFStringRef)v, buf, (CFIndex)n, kCFStringEncodingUTF8);
}

// macOS spells it "USB" / "Bluetooth Low Energy"; match loosely.
static int transport_is_usb(const char *t) { return strcasestr(t, "usb") != NULL; }
static int transport_is_ble(const char *t) { return strcasestr(t, "bluetooth") != NULL; }

// ─── Via request/response over raw HID ────────────────────────────────────
// Replies arrive as INPUT reports, so we need a callback + a run loop.

static uint8_t g_in_buf[64];
static uint8_t g_in[VIA_REPORT_LEN];
static volatile int g_got;

static void input_cb(void *ctx, IOReturn result, void *sender, IOHIDReportType type,
                     uint32_t report_id, uint8_t *report, CFIndex len) {
    (void)ctx; (void)result; (void)sender; (void)type; (void)report_id;
    if (g_got) return;
    size_t n = (size_t)len < sizeof g_in ? (size_t)len : sizeof g_in;
    memset(g_in, 0, sizeof g_in);
    memcpy(g_in, report, n);
    g_got = 1;
    CFRunLoopStop(CFRunLoopGetCurrent());
}

static int via_xfer(IOHIDDeviceRef dev, const uint8_t *req, uint8_t *resp) {
    g_got = 0;
    if (IOHIDDeviceSetReport(dev, kIOHIDReportTypeOutput, 0, req, VIA_REPORT_LEN) != kIOReturnSuccess)
        return -1;
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 1.0, false);
    if (!g_got) return -1;
    memcpy(resp, g_in, VIA_REPORT_LEN);
    return 0;
}

// Via keycodes: the low byte of a basic key is its HID usage; bits 8..12 carry
// QMK's modifier flags (QK_LCTL 0x0100, QK_LSFT 0x0200, QK_LALT 0x0400,
// QK_LGUI 0x0800, 0x1000 = right-hand).
static const char *hid_usage_name(unsigned u) {
    static char buf[16];
    if (u >= 0x04 && u <= 0x1d) { buf[0] = (char)('A' + (u - 0x04)); buf[1] = 0; return buf; }
    if (u >= 0x1e && u <= 0x26) { buf[0] = (char)('1' + (u - 0x1e)); buf[1] = 0; return buf; }
    switch (u) {
        case 0x00: return "No";
        case 0x27: return "0";
        case 0x28: return "Enter";
        case 0x29: return "Escape";
        case 0x2a: return "Backspace";
        case 0x2b: return "Tab";
        case 0x2c: return "Space";
        case 0x2d: return "Minus";
        case 0x2e: return "Equal";
        case 0x2f: return "LeftBracket";
        case 0x30: return "RightBracket";
        case 0x31: return "Backslash";
        case 0x33: return "Semicolon";
        case 0x34: return "Quote";
        case 0x35: return "Grave";
        case 0x36: return "Comma";
        case 0x37: return "Dot";
        case 0x38: return "Slash";
        case 0x4c: return "Delete";
    }
    snprintf(buf, sizeof buf, "%#04x", u);
    return buf;
}

static void keycode_str(unsigned kc, char *out, size_t n) {
    // QMK/Via layer keycodes live at 0x52xx and are NOT mod+key — decode them
    // first or the mod bits below read them as nonsense (0x5266 is TG(6), not
    // "RShift+0x66").
    if ((kc & 0xff00) == 0x5200) {
        const char *op = NULL;
        switch (kc & 0x00e0) {
            case 0x00: op = "TO";  break;
            case 0x20: op = "MO";  break;
            case 0x40: op = "DF";  break;
            case 0x60: op = "TG";  break;
            case 0x80: op = "OSL"; break;
        }
        if (op) { snprintf(out, n, "%s(%u)", op, kc & 0x1f); return; }
    }
    unsigned mods = (kc >> 8) & 0x1f;
    const char *side = (mods & 0x10) ? "R" : "L";
    char pre[64];
    pre[0] = '\0';
    if (mods & 0x01) { strncat(pre, side, sizeof pre - strlen(pre) - 1); strncat(pre, "Ctrl+",  sizeof pre - strlen(pre) - 1); }
    if (mods & 0x02) { strncat(pre, side, sizeof pre - strlen(pre) - 1); strncat(pre, "Shift+", sizeof pre - strlen(pre) - 1); }
    if (mods & 0x04) { strncat(pre, side, sizeof pre - strlen(pre) - 1); strncat(pre, "Alt+",   sizeof pre - strlen(pre) - 1); }
    if (mods & 0x08) { strncat(pre, side, sizeof pre - strlen(pre) - 1); strncat(pre, "Gui+",   sizeof pre - strlen(pre) - 1); }
    if ((kc & 0xff00) && !mods)
        snprintf(out, n, "%#06x", kc);            // layer-tap / macro / custom
    else
        snprintf(out, n, "%s%s", pre, hid_usage_name(kc & 0xff));
}

static int dump_combos(IOHIDDeviceRef dev, int count) {
    IOHIDDeviceRegisterInputReportCallback(dev, g_in_buf, sizeof g_in_buf, input_cb, NULL);
    IOHIDDeviceScheduleWithRunLoop(dev, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);

    uint8_t req[VIA_REPORT_LEN], resp[VIA_REPORT_LEN];

    // GetNumberOfEntries first, so we report the firmware's real slot count.
    memset(req, 0, sizeof req);
    req[0] = VIA_CMD_VIAL; req[1] = VIAL_DYNAMIC_ENTRY_OP; req[2] = VIAL_GET_NUMBER_OF_ENTRIES;
    if (via_xfer(dev, req, resp) == 0) {
        printf("firmware slots: morse=%u combo=%u key_override=%u\n", resp[0], resp[1], resp[2]);
        if (count <= 0) count = resp[1];
    }
    if (count <= 0) count = 18;

    for (int i = 0; i < count; i++) {
        memset(req, 0, sizeof req);
        req[0] = VIA_CMD_VIAL; req[1] = VIAL_DYNAMIC_ENTRY_OP; req[2] = VIAL_COMBO_GET;
        req[3] = (uint8_t)i;
        if (via_xfer(dev, req, resp) != 0) {
            fprintf(stderr, "kobu-bootloader: no reply for combo %d\n", i);
            return 1;
        }
        if (resp[0] != 0) { fprintf(stderr, "kobu-bootloader: combo %d rc=%u\n", i, resp[0]); continue; }

        unsigned in[4], out;
        for (int k = 0; k < 4; k++) in[k] = (unsigned)resp[1 + k * 2] | ((unsigned)resp[2 + k * 2] << 8);
        out = (unsigned)resp[9] | ((unsigned)resp[10] << 8);

        int empty = !out;
        for (int k = 0; k < 4; k++) if (in[k]) empty = 0;
        if (empty) { printf("  %2d: (disabled)\n", i); continue; }

        char parts[4][64], os[64];
        char line[300];
        line[0] = '\0';
        for (int k = 0; k < 4; k++) {
            if (!in[k]) continue;
            keycode_str(in[k], parts[k], sizeof parts[k]);
            if (line[0]) strncat(line, " + ", sizeof line - strlen(line) - 1);
            strncat(line, parts[k], sizeof line - strlen(line) - 1);
        }
        keycode_str(out, os, sizeof os);
        printf("  %2d: %-34s -> %-22s (out=%#06x)\n", i, line, os, out);
    }
    return 0;
}

static void usage(void) {
    fprintf(stderr,
        "usage: kobu-bootloader [--list] [--dump-combos [N]]\n"
        "                       [--transport usb|ble|any] [--serial SUBSTR]\n"
        "\n"
        "  --list             enumerate kobu2 HID interfaces and exit\n"
        "  --dump-combos [N]  read the live combo table back and exit\n"
        "  --transport WHICH  which transport to target (default: usb)\n"
        "  --serial SUBSTR    require the serial number to contain SUBSTR\n"
        "                     (the last 6 hex digits are the nRF FICR DEVICEID,\n"
        "                      so they identify the physical chip)\n");
}

int main(int argc, char **argv) {
    int do_list = 0;
    int do_dump = 0, dump_count = 0;
    const char *want_transport = "usb";
    const char *want_serial = NULL;

    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--list")) {
            do_list = 1;
        } else if (!strcmp(argv[i], "--dump-combos")) {
            do_dump = 1;
            if (i + 1 < argc && argv[i + 1][0] != '-') dump_count = atoi(argv[++i]);
        } else if (!strcmp(argv[i], "--transport") && i + 1 < argc) {
            want_transport = argv[++i];
        } else if (!strcmp(argv[i], "--serial") && i + 1 < argc) {
            want_serial = argv[++i];
        } else {
            usage();
            return 2;
        }
    }

    IOHIDManagerRef mgr = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);
    if (!mgr) { fprintf(stderr, "kobu-bootloader: IOHIDManagerCreate failed\n"); return 1; }

    // Match on VID/PID only; the usage-page filter happens below so --list can
    // show every interface the keyboard exposes.
    CFMutableDictionaryRef match = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    int vid = KOBU_VID, pid = KOBU_PID;
    CFNumberRef vidn = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &vid);
    CFNumberRef pidn = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &pid);
    CFDictionarySetValue(match, CFSTR(kIOHIDVendorIDKey), vidn);
    CFDictionarySetValue(match, CFSTR(kIOHIDProductIDKey), pidn);
    IOHIDManagerSetDeviceMatching(mgr, match);

    IOHIDManagerOpen(mgr, kIOHIDOptionsTypeNone);
    CFSetRef devs = IOHIDManagerCopyDevices(mgr);
    if (!devs || CFSetGetCount(devs) == 0) {
        fprintf(stderr, "kobu-bootloader: no kobu2 (%04x:%04x) HID device found.\n"
                        "  Is the LEFT half plugged in with a DATA-capable USB cable?\n",
                KOBU_VID, KOBU_PID);
        return 1;
    }

    CFIndex n = CFSetGetCount(devs);
    IOHIDDeviceRef *list = calloc((size_t)n, sizeof(*list));
    CFSetGetValues(devs, (const void **)list);

    IOHIDDeviceRef target = NULL;
    int vial_seen = 0;

    for (CFIndex i = 0; i < n; i++) {
        IOHIDDeviceRef d = list[i];
        long up = get_long(d, CFSTR(kIOHIDPrimaryUsagePageKey));
        long us = get_long(d, CFSTR(kIOHIDPrimaryUsageKey));
        char transport[64], serial[128], product[128];
        get_str(d, CFSTR(kIOHIDTransportKey), transport, sizeof transport);
        get_str(d, CFSTR(kIOHIDSerialNumberKey), serial, sizeof serial);
        get_str(d, CFSTR(kIOHIDProductKey), product, sizeof product);

        int is_vial = (up == VIAL_USAGE_PAGE && us == VIAL_USAGE);
        if (is_vial) vial_seen = 1;

        if (do_list) {
            printf("%-8s usage=%#06lx:%#04lx %-24s %s%s\n",
                   transport[0] ? transport : "?", up, us, serial, product,
                   is_vial ? "   <- Vial raw HID" : "");
            continue;
        }

        if (!is_vial) continue;
        if (strcmp(want_transport, "any") != 0) {
            if (!strcmp(want_transport, "usb") && !transport_is_usb(transport)) continue;
            if (!strcmp(want_transport, "ble") && !transport_is_ble(transport)) continue;
        }
        if (want_serial && !strstr(serial, want_serial)) continue;
        target = d;
        break;
    }

    if (do_list) return 0;

    if (!target) {
        if (vial_seen)
            fprintf(stderr, "kobu-bootloader: a Vial interface exists but none matched "
                            "transport=%s%s%s.\n  Run --list to see what is attached.\n",
                    want_transport, want_serial ? " serial~=" : "", want_serial ? want_serial : "");
        else
            fprintf(stderr, "kobu-bootloader: kobu2 is present but exposes no Vial raw-HID "
                            "interface (usage page %#06x / usage %#04x).\n",
                    VIAL_USAGE_PAGE, VIAL_USAGE);
        return 1;
    }

    IOReturn r = IOHIDDeviceOpen(target, kIOHIDOptionsTypeNone);
    if (r != kIOReturnSuccess) {
        fprintf(stderr, "kobu-bootloader: IOHIDDeviceOpen failed (0x%08x). "
                        "Input Monitoring permission may be required.\n", r);
        return 1;
    }

    if (do_dump) return dump_combos(target, dump_count);

    uint8_t report[VIA_REPORT_LEN];
    memset(report, 0, sizeof report);
    report[0] = VIA_BOOTLOADER_JUMP;

    // The Vial raw-HID descriptor carries no report ID, so report ID 0.
    r = IOHIDDeviceSetReport(target, kIOHIDReportTypeOutput, 0, report, sizeof report);
    if (r != kIOReturnSuccess) {
        fprintf(stderr, "kobu-bootloader: IOHIDDeviceSetReport failed (0x%08x)\n", r);
        return 1;
    }

    char serial[128];
    get_str(target, CFSTR(kIOHIDSerialNumberKey), serial, sizeof serial);
    printf("kobu-bootloader: BootloaderJump sent to %s — the board should reappear "
           "as a UF2 volume (INFO_UF2.TXT, usually /Volumes/XIAO-SENSE).\n", serial);
    return 0;
}
