//! Onboard RGB LED controller for the kobu2 halves under the DONGLE topology.
//!
//! User-specified staging (2026-08-13), deliberately simpler and *louder*
//! than the classic topology's power-saving `../rmk/src/peripheral_led.rs`
//! (which goes dark 2 s after connecting and made the link state unreadable):
//!
//!   1. **Boot battery window** — for [`BOOT_BATTERY_WINDOW`] after power-on
//!      the LED shows the battery-level color (green / yellow / red, same
//!      thresholds as everywhere else). Off until the first sample (~1 s).
//!   2. **Connected to the dongle** — solid **blue**, for as long as the
//!      split link is up.
//!   3. **Not connected** — solid **red**, for as long as the link is down.
//!
//! Trade-off the user accepted: a continuously lit LED draws a few mA from
//! the half's LiPo. If battery life ever matters more than glanceability,
//! dim by reverting to `peripheral_led.rs` or shortening the windows.
//!
//! The R/G/B GPIOs (P0.26 / P0.30 / P0.06) are common-anode: pin LOW = on.

use core::sync::atomic::Ordering;

use embassy_nrf::gpio::Output;
use embassy_time::{Duration, Instant};
use rmk::channel::{CONTROLLER_CHANNEL, ControllerSub};
use rmk::controller::{Controller, PollingController};
use rmk::event::ControllerEvent;
use rmk::input_device::battery::{KOBU_STATUS_LED_BAT_HIGH, KOBU_STATUS_LED_BAT_LOW};

/// How long after power-on the battery color is shown before the LED
/// switches to the solid link indicator.
const BOOT_BATTERY_WINDOW: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Color {
    Off,
    Green,
    Yellow,
    Red,
    Blue,
    Purple,
}

/// Battery → color with the shared kobu thresholds (defaults 60 / 20; the
/// atomics keep their defaults on a peripheral — the Via write handler that
/// retunes them lives on the central).
fn battery_color(percent: u8) -> Color {
    let high = KOBU_STATUS_LED_BAT_HIGH.load(Ordering::Relaxed);
    let low = KOBU_STATUS_LED_BAT_LOW.load(Ordering::Relaxed);
    if percent > high {
        Color::Green
    } else if percent > low {
        Color::Yellow
    } else {
        Color::Red
    }
}

pub enum PeriLedEvent {
    /// This half's own battery percentage (decoded locally by the split
    /// peripheral publish patches).
    Battery(u8),
    /// Split link to the dongle up (`true`) / down (`false`).
    Connected(bool),
}

pub struct PeriLedController<'d> {
    red: Output<'d>,
    green: Output<'d>,
    blue: Output<'d>,
    sub: ControllerSub,
    /// `None` until the first `ControllerEvent::Battery` arrives.
    battery: Option<u8>,
    /// `false` is also published on every advertise restart, which correctly
    /// reads as "not connected right now".
    connected: bool,
    /// Instant after which the boot battery indication yields to the solid
    /// link indicator.
    boot_until: Instant,
    current: Color,
}

impl<'d> PeriLedController<'d> {
    /// All three pins are expected to be initialized `Level::High` (off).
    pub fn new(red: Output<'d>, green: Output<'d>, blue: Output<'d>) -> Self {
        Self {
            red,
            green,
            blue,
            sub: CONTROLLER_CHANNEL.subscriber().unwrap(),
            battery: None,
            connected: false,
            boot_until: Instant::now() + BOOT_BATTERY_WINDOW,
            current: Color::Off,
        }
    }

    fn target_color(&self) -> Color {
        // Boot window: TEMPORARILY solid purple (2026-08-13 user request —
        // the battery color was hard to attribute to "boot", so purple makes
        // the window unmistakable). Once verified on hardware, restore the
        // battery color by replacing `Color::Purple` with:
        //     match self.battery { Some(p) => battery_color(p), None => Color::Off }
        // (`self.battery` keeps being collected for exactly that.)
        if Instant::now() < self.boot_until {
            return Color::Purple;
        }
        // Then a solid, always-on link indicator: blue = linked to the
        // dongle, red = alone.
        if self.connected { Color::Blue } else { Color::Red }
    }

    fn apply(&mut self, color: Color) {
        if self.current == color {
            return;
        }
        // (r, g, b) — true means LED on. Common-anode: LOW = on.
        let (r, g, b) = match color {
            Color::Off => (false, false, false),
            Color::Green => (false, true, false),
            Color::Yellow => (true, true, false),
            Color::Red => (true, false, false),
            Color::Blue => (false, false, true),
            Color::Purple => (true, false, true),
        };
        if r {
            self.red.set_low();
        } else {
            self.red.set_high();
        }
        if g {
            self.green.set_low();
        } else {
            self.green.set_high();
        }
        if b {
            self.blue.set_low();
        } else {
            self.blue.set_high();
        }
        self.current = color;
    }
}

impl<'d> Controller for PeriLedController<'d> {
    type Event = PeriLedEvent;

    async fn process_event(&mut self, event: PeriLedEvent) {
        match event {
            PeriLedEvent::Battery(p) => self.battery = Some(p),
            PeriLedEvent::Connected(c) => self.connected = c,
        }
        let color = self.target_color();
        self.apply(color);
    }

    async fn next_message(&mut self) -> PeriLedEvent {
        loop {
            match self.sub.next_message_pure().await {
                ControllerEvent::Battery(p) => return PeriLedEvent::Battery(p),
                ControllerEvent::SplitCentral(c) => return PeriLedEvent::Connected(c),
                _ => continue,
            }
        }
    }
}

impl<'d> PollingController for PeriLedController<'d> {
    /// Poll so the boot-window expiry lands promptly even with no events.
    const INTERVAL: Duration = Duration::from_millis(50);

    async fn update(&mut self) {
        let color = self.target_color();
        self.apply(color);
    }
}
