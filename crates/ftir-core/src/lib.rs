//! FTIR engine: pure calculation, no I/O, no unsafe, no native dependencies.
#![forbid(unsafe_code)]

pub mod anonimizza;
pub mod assign;
pub mod budget;
pub mod comparisons;
pub mod confronti;
pub mod didactic;
pub mod error;
pub mod measurement_quality;
pub mod miscele;
pub mod passi;
pub mod peak_index;
pub mod peaks;
pub mod readers;
pub mod rules;
pub mod single_beam;
pub mod spectrum;
pub mod steps;
pub mod synthetic;
pub mod synthetic_ispd;
pub mod synthetic_ispd_fixtures;
pub mod synthetic_jcamp;
pub mod synthetic_opus;
pub mod synthetic_spa;
pub mod synthetic_spc;
pub mod synthetic_text;

/// Version of the engine, read from the crate manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
