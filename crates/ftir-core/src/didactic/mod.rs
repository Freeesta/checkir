//! Didactic engine for the theory section: pure functions behind the interactive figures.
//! The page only draws; every number comes from here. Errors are `didactic.<case>` keys.

pub mod apodization;
pub mod depth;
pub mod fft;
pub mod interferogram;
pub mod json;
pub mod ratio;
pub mod spectrum;
pub mod spring;

use crate::error::EngineError;

/// Upper bound on the number of points of any didactic array (samples, padded FFT length).
pub const MAX_POINTS: usize = 1 << 22;

pub(crate) fn not_positive(name: &'static str) -> EngineError {
    EngineError::new("didactic.not_positive", "value must be finite and positive")
        .with_param("name", name)
}

pub(crate) fn check_positive(name: &'static str, x: f64) -> Result<f64, EngineError> {
    if x.is_finite() && x > 0.0 {
        Ok(x)
    } else {
        Err(not_positive(name))
    }
}
