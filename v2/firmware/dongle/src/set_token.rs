//! Per-keyboard-set split-advertisement token (multi-set independence).
//!
//! All three binaries of ONE physical set (dongle + left + right) must carry
//! the SAME token; keyboards with different tokens — or stock v1 / classic-v2
//! builds, which have no token — can never cross-pair even during fresh
//! pairing (see `../rmk/build.rs::patch_rmk_split_adv_set_token`; the
//! manufacturer-data length byte makes the formats mutually invisible).
//!
//! Building a SECOND kobu2 dongle set? Change [`SPLIT_SET_TOKEN`] to any
//! other nonzero value for that set and the two sets are fully independent
//! from first power-on. (Bonded sets are independent regardless — rmk uses
//! directed advertising + stored addresses after the first pairing — the
//! token closes the pairing-time window.)

/// This set's token. Nonzero. 0x4B = "K" (kobu set #1).
pub const SPLIT_SET_TOKEN: u8 = 0x4B;

/// Store the token into the patched-rmk atomic. Call once at boot, before
/// the split machinery starts advertising or scanning.
pub fn apply_split_set_token() {
    rmk::input_device::battery::KOBU_SPLIT_SET_TOKEN
        .store(SPLIT_SET_TOKEN, core::sync::atomic::Ordering::Relaxed);
}
