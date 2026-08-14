//! LEFT half under the DONGLE topology — split peripheral id 1.
//!
//! This is the half that acts as the CENTRAL on the classic topology; here it
//! is demoted to a plain peripheral. Its trackball keeps its scroll role: the
//! dongle-side registry patch (`patch_rmk_peripheral_manager_source_disambiguation`
//! in ../rmk/build.rs) relabels this half's Joystick X→H / Y→V at ingest
//! because its `#[rmk_peripheral(id = 1)]` advertises id 1 — no special code
//! is needed in this binary. Matrix layout / trackball wiring come from
//! `[[split.peripheral]]` #1 of this crate's keyboard.toml.
//!
//! ⚠️ Flashing this over a half that previously ran the left-central build
//! MUST go through the `-clearstorage` variant once: the central build's
//! storage (keymap + its own bonds + the right half's address) is meaningless
//! for a peripheral and a stale bond blocks pairing with the dongle.

#![no_main]
#![no_std]

mod peri_led;
mod set_token;

use rmk::macros::rmk_peripheral;

#[rmk_peripheral(id = 1)]
mod keyboard_peripheral {
    // Bring the trait into scope so the macro-generated task join can call
    // `peripheral_led.polling_loop()`.
    use ::rmk::controller::PollingController;

    use crate::peri_led::PeriLedController;

    // Onboard RGB LED (P0.26/P0.30/P0.06, common anode), user-spec staging:
    // boot battery color (5 s) → solid blue while linked to the dongle /
    // solid red while alone. Same LED language as the right half.
    //
    // Controller initializers run in the entry scope before the split
    // machinery starts, so this block doubles as our earliest boot hook —
    // used to stamp the set token into the advertisement.
    #[controller(poll)]
    fn peripheral_led() {
        use ::embassy_nrf::gpio::{Level, Output, OutputDrive};
        // Multi-set independence: advertise THIS set's token so only our
        // own dongle scan-binds this half (see src/set_token.rs).
        crate::set_token::apply_split_set_token();
        let red = Output::new(p.P0_26, Level::High, OutputDrive::Standard);
        let green = Output::new(p.P0_30, Level::High, OutputDrive::Standard);
        let blue = Output::new(p.P0_06, Level::High, OutputDrive::Standard);
        PeriLedController::new(red, green, blue)
    }
}
