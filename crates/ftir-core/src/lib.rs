//! FTIR engine: pure calculation, no I/O, no unsafe, no native dependencies.
#![forbid(unsafe_code)]

pub mod budget;
pub mod confronti;
pub mod errore;
pub mod lettori;
pub mod passi;
pub mod regole;
pub mod sintetico;
pub mod spettro;

/// Version of the engine, read from the crate manifest.
pub const VERSIONE: &str = env!("CARGO_PKG_VERSION");
