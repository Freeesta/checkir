//! Single-beam ratio: T = sample / background, A = -log10(T). Absent points (T <= 0, background 0) are NaN.

use crate::error::{EngineError, EngineResult};

#[derive(Debug, Clone, PartialEq)]
pub struct Ratio {
    pub transmittance: Vec<f64>,
    pub absorbance: Vec<f64>,
}

pub fn ratio_to_absorbance(sample: &[f64], background: &[f64]) -> EngineResult<Ratio> {
    if sample.is_empty() {
        return Err(EngineError::new("didactic.empty", "no data"));
    }
    if sample.len() != background.len() {
        return Err(EngineError::new(
            "didactic.length_mismatch",
            "sample and background must have the same length",
        )
        .with_param("sample", sample.len())
        .with_param("background", background.len()));
    }
    let transmittance: Vec<f64> = sample
        .iter()
        .zip(background)
        .map(|(s, b)| {
            let t = s / b;
            if t.is_finite() && t > 0.0 {
                t
            } else {
                f64::NAN
            }
        })
        .collect();
    // `+ 0.0` turns -0 into 0 (T = 1) so that the JSON never prints "-0".
    let absorbance = transmittance.iter().map(|t| -t.log10() + 0.0).collect();
    Ok(Ratio {
        transmittance,
        absorbance,
    })
}

/// Inverse: T = 10^-A.
pub fn absorbance_to_ratio(absorbance: &[f64]) -> Vec<f64> {
    absorbance.iter().map(|a| 10f64.powf(-a)).collect()
}
