//! Prospector status display for the kobu2 dongle.
//!
//! Hardware: Waveshare 1.69" Touch LCD Module (240x280 IPS, ST7789V2, touch
//! unused) wired per carrefinho/prospector's adapter:
//!
//!   SPIM3 SCK = P1.13 (D8) · MOSI = P1.15 (D10) · CS = P1.14 (D9, active low)
//!   DC = P1.12 (D7, low = command) · RST = P0.29 (D3, active low)
//!   BL = P1.11 (D6, FET gate w/ pulldown → drive HIGH = backlight on)
//!
//! ⚠️ SPIM2 (8 MHz), NOT SPIM3: the reference ZMK build uses SPIM3 at 16 MHz,
//! but nRF52840 anomaly 198 ("SPIM3 transmit data might be corrupted") fires
//! whenever another AHB master touches RAM during a SPIM3 TX — with the BLE
//! stack + USB running that is constant — and Zephyr carries the nrfx
//! workaround while embassy-nrf 0.8 has none (only the nrf52832 anomaly-109
//! code exists in its spim.rs). First hardware bring-up (2026-08-13) showed
//! exactly the anomaly signature: backlight on (all SPI transactions
//! "complete" MCU-side) but nothing on the glass. SPIM2 is not affected and
//! 8 MHz repaints a full frame in ~140 ms, plenty for a status screen. Same
//! pins — nRF GPIOs map to any SPIM instance. Mode 0, MSB first. Pixels are
//! big-endian RGB565.
//!
//! The panel is a 240x280 window centered in the controller's 240x320 GRAM:
//! in landscape (MADCTL 0x60 = MX|MV, our orientation) the 20-pixel margin
//! moves to the COLUMN axis, so every CASET gets +20. The init sequence below
//! replicates the prospector-zmk-module vendored driver byte-for-byte
//! (including INVON — the panel is inverted-by-design). Two field quirks are
//! also carried over: the ST7789V can silently drift into DISPOFF/SLEEP after
//! hours of SPI noise, so DISPON is re-asserted every ~5 minutes; and the
//! backlight is only lit after the first frame lands so boot shows no white
//! flash.
//!
//! Rendering: no full framebuffer (240*280*2 = 131 KiB doesn't fit next to
//! two BLE links) — the 280x240 canvas is redrawn through a 280x24 strip
//! buffer (13.4 KiB static), 10 strips per frame, embedded-graphics drawing
//! against each strip with out-of-strip pixels dropped. A frame only redraws
//! when the displayed state actually changed (~sub-Hz in practice).
//!
//! Data sources: `CONTROLLER_CHANNEL` (`Layer`, `SplitPeripheral(id, conn)`,
//! `Key` for the WPM estimate) plus the kobu battery atomics the
//! `DongleBatteryRouter` maintains (`KOBU_CENTRAL_BATTERY_PERCENT` = left,
//! `KOBU_PERIPHERAL_BATTERY_PERCENT` = right) and the host-link signals
//! (`KOBU_HOST_CONNECTED` / VBUS) — the same sources the classic status LED
//! uses, upgraded from 1 RGB LED to a screen.

use core::convert::Infallible;
use core::sync::atomic::Ordering;

use embassy_nrf::gpio::{Level, Output, OutputDrive};
use embassy_nrf::peripherals as periph;
use embassy_nrf::spim::{self, Spim};
use embassy_nrf::{Peri, bind_interrupts};
use embassy_time::{Duration, Instant, Timer};
use embedded_graphics::mono_font::MonoTextStyle;
use embedded_graphics::mono_font::ascii::{FONT_6X13, FONT_10X20};
use embedded_graphics::pixelcolor::Rgb565;
use embedded_graphics::prelude::*;
use embedded_graphics::primitives::{Circle, PrimitiveStyle, Rectangle};
use embedded_graphics::text::Text;
use rmk::channel::{CONTROLLER_CHANNEL, ControllerSub};
use rmk::event::ControllerEvent;
use rmk::input_device::battery::{
    KOBU_CENTRAL_BATTERY_PERCENT, KOBU_HOST_CONNECTED, KOBU_PERIPHERAL_BATTERY_PERCENT,
    KOBU_STATUS_LED_BAT_HIGH, KOBU_STATUS_LED_BAT_LOW,
};
use static_cell::StaticCell;

bind_interrupts!(struct DisplayIrqs {
    SPI2 => spim::InterruptHandler<periph::SPI2>;
});

/// Landscape canvas (MADCTL 0x60 swaps the panel's native 240x280).
const W: usize = 280;
const H: usize = 240;
/// Landscape puts the 240x320-GRAM margin on the column axis.
const X_OFFSET: u16 = 20;
/// Strip renderer height. 240 / 24 = 10 strips per frame.
const STRIP_H: usize = 24;
const STRIP_BUF_LEN: usize = W * STRIP_H * 2;

/// ST7789V blackout quirk: periodically re-assert DISPON.
const DISPON_REASSERT: Duration = Duration::from_secs(290);

static STRIP_BUF: StaticCell<[u8; STRIP_BUF_LEN]> = StaticCell::new();

// ─── Panel driver ────────────────────────────────────────────────────

struct St7789 {
    // embassy-nrf 0.8's Spim is instance-type-erased.
    spim: Spim<'static>,
    dc: Output<'static>,
    cs: Output<'static>,
}

impl St7789 {
    /// Send one command + up to 14 parameter bytes (the longest, the gamma
    /// tables, are 14). Parameters are staged through a stack buffer because
    /// EasyDMA cannot read from flash and literal slices may be in .rodata.
    async fn cmd(&mut self, op: u8, args: &[u8]) {
        self.cs.set_low();
        self.dc.set_low();
        let _ = self.spim.write(&[op]).await;
        if !args.is_empty() {
            self.dc.set_high();
            let mut tmp = [0u8; 14];
            tmp[..args.len()].copy_from_slice(args);
            let _ = self.spim.write(&tmp[..args.len()]).await;
        }
        self.cs.set_high();
    }

    /// The prospector-zmk-module init sequence, byte-for-byte (its vendored
    /// Zephyr st7789v driver with the beekeeb/Waveshare 1.69" DT params).
    async fn init(&mut self, rst: &mut Output<'static>) {
        Timer::after_millis(1).await;
        rst.set_low();
        Timer::after_millis(6).await;
        rst.set_high();
        Timer::after_millis(20).await;

        self.cmd(0x28, &[]).await; // DISPOFF while configuring
        self.cmd(0xDF, &[0x5A, 0x69, 0x02, 0x01]).await; // CMD2EN
        self.cmd(0xB2, &[0x0C, 0x0C, 0x00, 0x33, 0x33]).await; // PORCTRL
        self.cmd(0xBA, &[0x00]).await; // DGMEN
        self.cmd(0xC6, &[0x0F]).await; // FRCTRL2
        self.cmd(0xB7, &[0x35]).await; // GCTRL
        self.cmd(0xBB, &[0x19]).await; // VCOMS
        self.cmd(0xC2, &[0x01]).await; // VDVVRHEN
        self.cmd(0xC3, &[0x12]).await; // VRHS
        self.cmd(0xC4, &[0x20]).await; // VDVS
        self.cmd(0xD0, &[0xA4, 0xA1]).await; // PWCTRL1
        self.cmd(0x36, &[0x00]).await; // MADCTL (portrait during init)
        self.cmd(0x3A, &[0x05]).await; // COLMOD 16bpp
        self.cmd(0xC0, &[0x2C]).await; // LCMCTRL
        self.cmd(0x26, &[0x01]).await; // GAMSET
        self.cmd(0x21, &[]).await; // INVON — panel is inverted by design
        self.cmd(
            0xE0,
            &[
                0xD0, 0x04, 0x0D, 0x11, 0x13, 0x2B, 0x3F, 0x54, 0x4C, 0x18, 0x0D, 0x0B, 0x1F, 0x23,
            ],
        )
        .await; // PVGAM
        self.cmd(
            0xE1,
            &[
                0xD0, 0x04, 0x0C, 0x11, 0x13, 0x2C, 0x3F, 0x44, 0x51, 0x2F, 0x1F, 0x1F, 0x20, 0x23,
            ],
        )
        .await; // NVGAM
        self.cmd(0xB0, &[0x00, 0xF0]).await; // RAMCTRL
        self.cmd(0xB1, &[0xCD, 0x08, 0x14]).await; // RGBCTRL

        self.cmd(0x11, &[]).await; // SLPOUT
        Timer::after_millis(120).await;
        self.cmd(0x36, &[0x60]).await; // MADCTL MX|MV = landscape 280x240
        self.cmd(0x29, &[]).await; // DISPON
    }

    /// Push a full-width strip. `data` is big-endian RGB565, `h` rows.
    async fn blit_strip(&mut self, y: u16, h: u16, data: &[u8]) {
        let x0 = X_OFFSET;
        let x1 = X_OFFSET + W as u16 - 1;
        let y1 = y + h - 1;
        self.cmd(0x2A, &[(x0 >> 8) as u8, x0 as u8, (x1 >> 8) as u8, x1 as u8])
            .await; // CASET
        self.cmd(0x2B, &[(y >> 8) as u8, y as u8, (y1 >> 8) as u8, y1 as u8])
            .await; // RASET
        self.cs.set_low();
        self.dc.set_low();
        let _ = self.spim.write(&[0x2C]).await; // RAMWR
        self.dc.set_high();
        // 13440 B per strip < the 65535-byte SPIM3 EasyDMA MAXCNT ceiling.
        let _ = self.spim.write(data).await;
        self.cs.set_high();
    }
}

// ─── Strip render target ─────────────────────────────────────────────

/// embedded-graphics target over one 280x`STRIP_H` window of the canvas.
/// Reports the FULL 280x240 size so widget code draws in absolute
/// coordinates; pixels outside the current strip are dropped.
struct Strip<'b> {
    buf: &'b mut [u8; STRIP_BUF_LEN],
    y0: i32,
}

impl OriginDimensions for Strip<'_> {
    fn size(&self) -> Size {
        Size::new(W as u32, H as u32)
    }
}

impl DrawTarget for Strip<'_> {
    type Color = Rgb565;
    type Error = Infallible;

    fn draw_iter<I>(&mut self, pixels: I) -> Result<(), Infallible>
    where
        I: IntoIterator<Item = Pixel<Rgb565>>,
    {
        for Pixel(pt, color) in pixels {
            if pt.x < 0 || pt.x >= W as i32 {
                continue;
            }
            let sy = pt.y - self.y0;
            if sy < 0 || sy >= STRIP_H as i32 {
                continue;
            }
            let idx = (sy as usize * W + pt.x as usize) * 2;
            let [hi, lo] = color.into_storage().to_be_bytes();
            self.buf[idx] = hi;
            self.buf[idx + 1] = lo;
        }
        Ok(())
    }
}

// ─── Displayed state ─────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
struct DisplayState {
    layer: u8,
    left_conn: bool,
    right_conn: bool,
    host_usb: bool,
    host_ble: bool,
    /// 0 is rendered as "not yet reported" (the atomics boot at 0 and a real
    /// 0% is a dead battery anyway).
    left_bat: u8,
    right_bat: u8,
    wpm: u16,
}

impl DisplayState {
    const fn new() -> Self {
        Self {
            layer: 0,
            left_conn: false,
            right_conn: false,
            host_usb: false,
            host_ble: false,
            left_bat: 0,
            right_bat: 0,
            wpm: 0,
        }
    }
}

/// Mirrors `status_led::layer_color` so screen and (kept) LED agree.
fn layer_accent(layer: u8) -> Rgb565 {
    match layer {
        0 => Rgb565::WHITE,
        1 => Rgb565::BLUE,           // Win/Linux overlay
        2 => Rgb565::GREEN,          // numbers / symbols
        3 => Rgb565::CYAN,           // settings / media / BLE
        4 => Rgb565::MAGENTA,        // mouse (auto-mouse layer)
        5 => Rgb565::YELLOW,         // Emacs
        _ => Rgb565::WHITE,          // Neovim / future
    }
}

fn layer_name(layer: u8) -> &'static str {
    match layer {
        0 => "BASE",
        1 => "WIN",
        2 => "NUM/SYM",
        3 => "SETTING",
        4 => "MOUSE",
        5 => "EMACS",
        6 => "NEOVIM",
        _ => "LAYER?",
    }
}

fn battery_color(pct: u8) -> Rgb565 {
    let high = KOBU_STATUS_LED_BAT_HIGH.load(Ordering::Relaxed);
    let low = KOBU_STATUS_LED_BAT_LOW.load(Ordering::Relaxed);
    if pct > high {
        Rgb565::GREEN
    } else if pct > low {
        Rgb565::YELLOW
    } else {
        Rgb565::RED
    }
}

fn vbus_present() -> bool {
    embassy_nrf::pac::POWER.usbregstatus().read().vbusdetect()
}

// ─── Widgets ─────────────────────────────────────────────────────────

const DIM: Rgb565 = Rgb565::new(12, 24, 12);

fn draw_frame(t: &mut Strip<'_>, s: &DisplayState) {
    let big = MonoTextStyle::new(&FONT_10X20, Rgb565::WHITE);
    let small_dim = MonoTextStyle::new(&FONT_6X13, DIM);

    // Header: name + host transport.
    let _ = Text::new("kobu2", Point::new(10, 26), big).draw(t);
    let host_style = |on: bool, color: Rgb565| {
        MonoTextStyle::new(&FONT_10X20, if on { color } else { DIM })
    };
    let _ = Text::new("USB", Point::new(190, 26), host_style(s.host_usb, Rgb565::GREEN)).draw(t);
    let _ = Text::new("BLE", Point::new(234, 26), host_style(s.host_ble, Rgb565::CSS_DODGER_BLUE)).draw(t);
    let _ = Rectangle::new(Point::new(0, 36), Size::new(W as u32, 2))
        .into_styled(PrimitiveStyle::with_fill(DIM))
        .draw(t);

    // Layer block: accent bar + name.
    let accent = layer_accent(s.layer);
    let _ = Rectangle::new(Point::new(0, 52), Size::new(8, 32))
        .into_styled(PrimitiveStyle::with_fill(accent))
        .draw(t);
    let _ = Text::new("LAYER", Point::new(20, 62), small_dim).draw(t);
    let _ = Text::new(
        layer_name(s.layer),
        Point::new(20, 82),
        MonoTextStyle::new(&FONT_10X20, accent),
    )
    .draw(t);

    // Halves: link dot + battery bar + percent.
    draw_half(t, 116, "L", s.left_conn, s.left_bat);
    draw_half(t, 156, "R", s.right_conn, s.right_bat);

    // Footer: WPM estimate.
    let _ = Text::new("WPM", Point::new(10, 218), small_dim).draw(t);
    let mut wpm_txt = heapless_u16(s.wpm);
    if s.wpm == 0 {
        wpm_txt = HeaplessNum::from_str("-");
    }
    let _ = Text::new(wpm_txt.as_str(), Point::new(58, 222), big).draw(t);
}

fn draw_half(t: &mut Strip<'_>, y: i32, label: &str, conn: bool, bat: u8) {
    let big = MonoTextStyle::new(&FONT_10X20, Rgb565::WHITE);
    let _ = Text::new(label, Point::new(10, y + 18), big).draw(t);

    // Link dot: green = connected, red = away (matches the halves' LEDs).
    let dot = if conn { Rgb565::GREEN } else { Rgb565::RED };
    let _ = Circle::new(Point::new(28, y + 4), 14)
        .into_styled(PrimitiveStyle::with_fill(dot))
        .draw(t);

    // Battery bar: 150x20 outline + proportional fill.
    let bar = Rectangle::new(Point::new(56, y), Size::new(150, 22));
    let _ = bar.into_styled(PrimitiveStyle::with_stroke(DIM, 1)).draw(t);
    if bat > 0 {
        let fill_w = (bat as u32).min(100) * 146 / 100;
        if fill_w > 0 {
            let _ = Rectangle::new(Point::new(58, y + 2), Size::new(fill_w, 18))
                .into_styled(PrimitiveStyle::with_fill(battery_color(bat)))
                .draw(t);
        }
        let mut txt = heapless_u16(bat as u16);
        let _ = txt.push('%');
        let _ = Text::new(txt.as_str(), Point::new(216, y + 18), big).draw(t);
    } else {
        let _ = Text::new("--%", Point::new(216, y + 18), MonoTextStyle::new(&FONT_10X20, DIM)).draw(t);
    }
}

// Tiny no-alloc number formatter (u16 → decimal string, max 5 digits + '%').
struct HeaplessNum {
    buf: [u8; 6],
    len: usize,
}

impl HeaplessNum {
    fn from_str(s: &str) -> Self {
        let mut buf = [0u8; 6];
        let len = s.len().min(6);
        buf[..len].copy_from_slice(&s.as_bytes()[..len]);
        Self { buf, len }
    }

    fn push(&mut self, c: char) -> Result<(), ()> {
        if self.len >= self.buf.len() {
            return Err(());
        }
        self.buf[self.len] = c as u8;
        self.len += 1;
        Ok(())
    }

    fn as_str(&self) -> &str {
        core::str::from_utf8(&self.buf[..self.len]).unwrap_or("?")
    }
}

fn heapless_u16(mut v: u16) -> HeaplessNum {
    let mut digits = [0u8; 5];
    let mut n = 0;
    loop {
        digits[n] = b'0' + (v % 10) as u8;
        v /= 10;
        n += 1;
        if v == 0 {
            break;
        }
    }
    let mut out = HeaplessNum { buf: [0u8; 6], len: 0 };
    for i in (0..n).rev() {
        let _ = out.push(digits[i] as char);
    }
    out
}

// ─── Main task ───────────────────────────────────────────────────────

/// Owns the panel forever. Joined into the dongle entry's task tree; never
/// returns. Display trouble must never take the keyboard down, so every SPI
/// result is discarded — worst case the screen is wrong, the keyboard lives.
#[allow(clippy::too_many_arguments)]
pub async fn run(
    spi: Peri<'static, periph::SPI2>,
    sck: Peri<'static, periph::P1_13>,
    mosi: Peri<'static, periph::P1_15>,
    cs: Peri<'static, periph::P1_14>,
    dc: Peri<'static, periph::P1_12>,
    rst: Peri<'static, periph::P0_29>,
    bl: Peri<'static, periph::P1_11>,
) -> ! {
    let mut config = spim::Config::default();
    // 8 MHz is SPIM2's ceiling — and deliberately NOT SPIM3, see module doc.
    config.frequency = spim::Frequency::M8;
    let spim = Spim::new_txonly(spi, DisplayIrqs, sck, mosi, config);

    let cs = Output::new(cs, Level::High, OutputDrive::Standard);
    let dc = Output::new(dc, Level::High, OutputDrive::Standard);
    let mut rst = Output::new(rst, Level::High, OutputDrive::Standard);
    // Backlight FET gate: keep dark until the first frame has landed.
    let mut bl = Output::new(bl, Level::Low, OutputDrive::Standard);

    let mut panel = St7789 { spim, dc, cs };
    panel.init(&mut rst).await;

    let buf = STRIP_BUF.init([0u8; STRIP_BUF_LEN]);

    // Boot self-test: backlight on immediately, then wipe the whole glass
    // RED → GREEN → BLUE (700 ms each). This splits the failure domains on
    // sight: wipes visible = SPI + init + panel are good end-to-end (any
    // later blank screen is a rendering bug); no wipes = SPI path / wiring /
    // panel init is at fault. `bl` must stay alive for the rest of the task —
    // dropping the Output would disconnect the pin and kill the backlight.
    bl.set_high();
    for color in [Rgb565::RED, Rgb565::GREEN, Rgb565::BLUE] {
        wipe(&mut panel, buf, color).await;
        Timer::after_millis(700).await;
    }

    let mut sub: ControllerSub = CONTROLLER_CHANNEL
        .subscriber()
        .expect("display: CONTROLLER_CHANNEL subscriber slots exhausted");

    let mut state = DisplayState::new();
    let mut drawn: Option<DisplayState> = None;
    let mut last_dispon = Instant::now();

    // WPM estimate: ControllerEvent::Key fires on both press and release, so
    // a keystroke ≈ 2 events; WPM = strokes/5 per minute = events/10 over a
    // rolling 60 s window (12 buckets × 5 s).
    let mut wpm_buckets = [0u16; 12];
    let mut wpm_bucket_i = 0usize;
    let mut wpm_events = 0u16;
    let mut last_bucket_roll = Instant::now();

    loop {
        // Wait for news or the housekeeping tick, then drain whatever queued.
        match rmk::embassy_futures::select::select(
            sub.next_message_pure(),
            Timer::after_millis(500),
        )
        .await
        {
            rmk::embassy_futures::select::Either::First(ev) => {
                apply_event(&mut state, &ev, &mut wpm_events);
            }
            rmk::embassy_futures::select::Either::Second(()) => {}
        }
        while let Some(ev) = sub.try_next_message_pure() {
            apply_event(&mut state, &ev, &mut wpm_events);
        }

        // Poll the sources that have no controller event.
        state.host_usb = vbus_present();
        state.host_ble = KOBU_HOST_CONNECTED.load(Ordering::Relaxed);
        state.left_bat = KOBU_CENTRAL_BATTERY_PERCENT.load(Ordering::Relaxed);
        state.right_bat = KOBU_PERIPHERAL_BATTERY_PERCENT.load(Ordering::Relaxed);

        // Roll the WPM window every 5 s.
        if last_bucket_roll.elapsed() >= Duration::from_secs(5) {
            last_bucket_roll = Instant::now();
            wpm_bucket_i = (wpm_bucket_i + 1) % wpm_buckets.len();
            wpm_buckets[wpm_bucket_i] = wpm_events;
            wpm_events = 0;
            let total: u32 = wpm_buckets.iter().map(|&b| b as u32).sum();
            state.wpm = (total / 10) as u16;
        }

        // ST7789V blackout quirk: re-assert DISPON and force a repaint.
        let mut force = false;
        if last_dispon.elapsed() >= DISPON_REASSERT {
            last_dispon = Instant::now();
            panel.cmd(0x29, &[]).await;
            force = true;
        }

        if force || drawn != Some(state) {
            for strip in 0..(H / STRIP_H) {
                let y0 = (strip * STRIP_H) as i32;
                buf.fill(0); // background: black
                let mut target = Strip { buf, y0 };
                draw_frame(&mut target, &state);
                panel.blit_strip(y0 as u16, STRIP_H as u16, buf).await;
            }
            drawn = Some(state);
        }
    }
}

/// Fill the whole glass with one color through the strip buffer.
async fn wipe(panel: &mut St7789, buf: &mut [u8; STRIP_BUF_LEN], color: Rgb565) {
    let [hi, lo] = color.into_storage().to_be_bytes();
    for px in buf.chunks_exact_mut(2) {
        px[0] = hi;
        px[1] = lo;
    }
    for strip in 0..(H / STRIP_H) {
        panel
            .blit_strip((strip * STRIP_H) as u16, STRIP_H as u16, buf)
            .await;
    }
}

fn apply_event(state: &mut DisplayState, ev: &ControllerEvent, wpm_events: &mut u16) {
    match ev {
        ControllerEvent::Layer(layer) => state.layer = *layer,
        // Peripheral id 0 = RIGHT half, id 1 = LEFT half (keyboard.toml order).
        ControllerEvent::SplitPeripheral(id, conn) => match id {
            0 => state.right_conn = *conn,
            _ => state.left_conn = *conn,
        },
        ControllerEvent::Key(_, _) => {
            *wpm_events = wpm_events.saturating_add(1);
        }
        _ => {}
    }
}
