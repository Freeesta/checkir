//! Shared part of the baseline steps: parameters common to all of them, the run-by-run application and the output.
//!
//! A baseline step returns the *corrected* spectrum (`y − baseline`) by default or the baseline itself
//! (`"output":"baseline"`, for the chart). Each run of present points is processed on its own; a run too short for
//! the method becomes absent. Positions in a run are indices: the grid must be uniform (resample with `griglia/1`).
use super::{invalid, text, Value};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// The baseline of every present run (absent where the run is too short), as a vector the length of the spectrum.
pub(crate) fn baseline_of(
    s: &Spectrum,
    min_len: usize,
    f: &dyn Fn(&[f64]) -> Vec<f64>,
) -> Vec<f64> {
    let mut out = vec![f64::NAN; s.len()];
    let mut start = 0;
    while start < s.len() {
        if !s.y[start].is_finite() {
            start += 1;
            continue;
        }
        let end = (start..s.len())
            .find(|i| !s.y[*i].is_finite())
            .unwrap_or(s.len());
        if end - start >= min_len {
            out[start..end].copy_from_slice(&f(&s.y[start..end]));
        }
        start = end;
    }
    out
}

/// `"corrected"` (default) or `"baseline"`.
pub(crate) fn output_mode(p: &Value) -> EngineResult<&str> {
    let m = text(p, "output", "corrected")?;
    if m != "corrected" && m != "baseline" {
        return Err(invalid("output", "expected corrected or baseline"));
    }
    Ok(m)
}

/// Spectrum for the chosen output.
pub(crate) fn finish(s: &Spectrum, id: &str, used: &Value, mode: &str, base: Vec<f64>) -> Spectrum {
    let y = if mode == "baseline" {
        base
    } else {
        s.y.iter().zip(&base).map(|(y, b)| y - b).collect()
    };
    super::result(s, id, used, s.y_unit, s.wavenumber_cm1.clone(), y)
}
