//! RIGHT half under the DONGLE topology — split peripheral id 0.
//!
//! Functionally identical to the classic topology's `../rmk/src/peripheral.rs`
//! (same id, same wiring, pointer trackball): the only difference is that this
//! binary is built against the dongle `keyboard.toml`, so it pairs with the
//! Prospector dongle instead of the left half. Because the stored central
//! bond/address changes, the FIRST flash onto a half that previously paired
//! with the left-central build must be the `-clearstorage` variant.

#![no_main]
#![no_std]

mod peri_led;
mod set_token;

use rmk::macros::rmk_peripheral;

#[rmk_peripheral(id = 0)]
mod keyboard_peripheral {
    // Bring the trait into scope so the macro-generated task join can call
    // `peripheral_led.polling_loop()`.
    use ::rmk::controller::PollingController;

    use crate::peri_led::PeriLedController;

    // Onboard RGB LED (P0.26/P0.30/P0.06, common anode), user-spec staging:
    // boot battery color (5 s) → solid blue while linked to the dongle /
    // solid red while alone. Same LED language as the left half.
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
