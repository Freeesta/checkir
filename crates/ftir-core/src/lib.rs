//! FTIR engine: pure calculation, no I/O, no unsafe, no native dependencies.
#![forbid(unsafe_code)]

pub mod anonimizza;
pub mod budget;
pub mod comparisons;
pub mod confronti;
pub mod error;
pub mod measurement_quality;
pub mod passi;
pub mod peaks;
pub mod readers;
pub mod rules;
pub mod spectrum;
pub mod steps;
pub mod synthetic;
pub mod synthetic_ispd;
pub mod synthetic_ispd_fixtures;
pub mod synthetic_jcamp;
pub mod synthetic_text;

/// Version of the engine, read from the crate manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
