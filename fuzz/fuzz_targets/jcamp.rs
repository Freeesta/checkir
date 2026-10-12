#![no_main]
//! Fuzz target: the jcamp reader must return a document or a translated error for any bytes, within small limits.
use ftir_core::readers::model::{Limits, Options};
use ftir_core::readers::jcamp;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let limits = Limits {
        max_bytes: 1 << 20,
        max_points: 10_000,
        ..Limits::STANDARD
    };
    let _ = jcamp::detect("fuzz.dx", data);
    let _ = jcamp::open(data, &limits, &Options::default());
});
