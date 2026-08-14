//! Battery source routing for the DONGLE topology.
//!
//! Both halves sample their own LiPo and forward the raw `Event::Battery(u16)`
//! over the split link. rmk strips the peripheral id on re-injection, so the
//! registry patch `patch_rmk_peripheral_manager_source_disambiguation`
//! (../rmk/build.rs) tags the LEFT half's samples (peripheral id 1) with
//! [`LEFT_SOURCE_BIT`] at ingest; the RIGHT half (id 0) arrives untagged.
//! The dongle's own macro-generated `adc_device` is discarded in
//! `src/dongle.rs` (USB-powered, P0_31 floats), so the classic topology's
//! `0x8000` central-sample tag never appears here.
//!
//! This processor sits at the head of the dongle's chain and:
//!
//!   * stores the decoded percentages into the SAME
//!     `rmk::input_device::battery::KOBU_*_BATTERY_PERCENT` atomics the
//!     classic topology uses — `KOBU_CENTRAL_BATTERY_PERCENT` = LEFT half,
//!     `KOBU_PERIPHERAL_BATTERY_PERCENT` = RIGHT half — so the patched Via
//!     Custom handler keeps answering kobu-config with 0x10 = 左 / 0x11 = 右
//!     unchanged, and the Prospector display reads the same two atomics;
//!
//!   * forwards `min(left_raw, right_raw)` (the weakest half) downstream so
//!     the upstream `BatteryProcessor` still drives `BATTERY_UPDATE` /
//!     `ControllerEvent::Battery` / the BLE Battery Service with a value that
//!     means "the keyboard's worst battery" instead of flickering between
//!     halves.

use core::cell::RefCell;
use core::sync::atomic::Ordering;

use rmk::event::Event;
use rmk::input_device::battery::{KOBU_CENTRAL_BATTERY_PERCENT, KOBU_PERIPHERAL_BATTERY_PERCENT};
use rmk::input_device::{InputProcessor, ProcessResult};
use rmk::keymap::KeyMap;

/// Set on LEFT-half (peripheral id 1) battery samples by the registry patch.
/// The XIAO SAADC is 12-bit (`val <= 4095`), so bit 14 is always free; bit 15
/// (`0x8000`) is reserved for the classic topology's central-sample tag.
const LEFT_SOURCE_BIT: u16 = 0x4000;

/// XIAO nRF52840 BLE on-module BAT divider ratio — must match `[ble]` in
/// keyboard.toml. Same formula as upstream `BatteryProcessor::get_battery_percent`
/// so both halves and the forwarded min decode consistently.
const ADC_DIVIDER_MEASURED: i32 = 510;
const ADC_DIVIDER_TOTAL: i32 = 1510;

fn lipo_percent_from_adc(val: u16) -> u8 {
    let val = val as i32;
    let measured = ADC_DIVIDER_MEASURED;
    let total = ADC_DIVIDER_TOTAL;
    if val > 4755_i32 * measured / total {
        100
    } else if val < 4055_i32 * measured / total {
        0
    } else {
        ((val * total / measured - 4055) / 7) as u8
    }
}

pub struct DongleBatteryRouter<
    'a,
    const ROW: usize,
    const COL: usize,
    const NUM_LAYER: usize,
    const NUM_ENCODER: usize,
> {
    keymap: &'a RefCell<KeyMap<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>>,
    /// Latest untagged raw sample per half; `None` until the first arrives.
    left_raw: Option<u16>,
    right_raw: Option<u16>,
}

impl<'a, const ROW: usize, const COL: usize, const NUM_LAYER: usize, const NUM_ENCODER: usize>
    DongleBatteryRouter<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>
{
    pub fn new(keymap: &'a RefCell<KeyMap<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>>) -> Self {
        Self {
            keymap,
            left_raw: None,
            right_raw: None,
        }
    }
}

impl<'a, const ROW: usize, const COL: usize, const NUM_LAYER: usize, const NUM_ENCODER: usize>
    InputProcessor<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>
    for DongleBatteryRouter<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>
{
    async fn process(&mut self, event: Event) -> ProcessResult {
        match event {
            Event::Battery(val) => {
                if val & LEFT_SOURCE_BIT != 0 {
                    let raw = val & !LEFT_SOURCE_BIT;
                    KOBU_CENTRAL_BATTERY_PERCENT.store(lipo_percent_from_adc(raw), Ordering::Relaxed);
                    self.left_raw = Some(raw);
                } else {
                    KOBU_PERIPHERAL_BATTERY_PERCENT.store(lipo_percent_from_adc(val), Ordering::Relaxed);
                    self.right_raw = Some(val);
                }
                // Weakest half goes downstream (BatteryProcessor → BAS /
                // ControllerEvent::Battery / status LED boot color).
                let weakest = match (self.left_raw, self.right_raw) {
                    (Some(l), Some(r)) => l.min(r),
                    (Some(l), None) => l,
                    (None, Some(r)) => r,
                    // Unreachable: we just stored one of them.
                    (None, None) => return ProcessResult::Stop,
                };
                ProcessResult::Continue(Event::Battery(weakest))
            }
            _ => ProcessResult::Continue(event),
        }
    }

    fn get_keymap(&self) -> &RefCell<KeyMap<'a, ROW, COL, NUM_LAYER, NUM_ENCODER>> {
        self.keymap
    }
}
