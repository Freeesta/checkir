#![no_main]
//! Fuzz target: the OPUS reader must return a document or a translated error for any bytes, within small limits.
use ftir_core::readers::model::{Limits, Options};
use ftir_core::readers::opus;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let limits = Limits {
        max_bytes: 1 << 20,
        max_points: 10_000,
        ..Limits::STANDARD
    };
    let _ = opus::detect("fuzz.0", data);
    let _ = opus::open(data, &limits, &Options::default());
});
