//! FTIR engine: pure calculation, no I/O, no unsafe, no native dependencies.
#![forbid(unsafe_code)]

pub mod budget;
pub mod comparisons;
pub mod error;
pub mod readers;
pub mod rules;
pub mod spectrum;
pub mod steps;
pub mod synthetic;
pub mod synthetic_jcamp;

/// Version of the engine, read from the crate manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
