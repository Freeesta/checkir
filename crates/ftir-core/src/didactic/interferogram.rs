//! Synthetic two-sided interferogram of lines and bands, sampled at x_j = (j - zpd_index) * step_cm.

use super::{check_positive, MAX_POINTS};
use crate::error::{EngineError, EngineResult};

/// A spectral line (or a Lorentzian band when `width_cm1` > 0) of the source spectrum.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Line {
    pub wavenumber_cm1: f64,
    pub amplitude: f64,
    pub width_cm1: f64,
}

/// Samples of the interferogram; the zero path difference sits at `zpd_index`.
#[derive(Debug, Clone, PartialEq)]
pub struct Interferogram {
    pub step_cm: f64,
    pub zpd_index: usize,
    pub intensity: Vec<f64>,
}

impl Interferogram {
    /// Optical path difference (cm) of sample `j`.
    pub fn opd_cm(&self, j: usize) -> f64 {
        (j as f64 - self.zpd_index as f64) * self.step_cm
    }
}

/// Interferogram of `lines` with `2 * half_points + 1` samples (symmetric around the zero path difference):
/// I(x) = sum a cos(2 pi nu x) exp(-pi width |x|). Width 0 is a pure line.
pub fn interferogram_from_lines(
    lines: &[Line],
    half_points: usize,
    step_cm: f64,
) -> EngineResult<Interferogram> {
    let step = check_positive("step_cm", step_cm)?;
    let n = 2 * half_points + 1;
    if half_points == 0 || n > MAX_POINTS {
        return Err(EngineError::new(
            "didactic.too_many_points",
            "the number of points is out of range",
        )
        .with_param("limit", MAX_POINTS));
    }
    let intensity = (0..n)
        .map(|j| {
            let x = (j as f64 - half_points as f64) * step;
            lines.iter().map(|l| line_value(l, x)).sum()
        })
        .collect();
    Ok(Interferogram {
        step_cm: step,
        zpd_index: half_points,
        intensity,
    })
}

fn line_value(l: &Line, x: f64) -> f64 {
    let decay = (-std::f64::consts::PI * l.width_cm1.max(0.0) * x.abs()).exp();
    l.amplitude * decay * (2.0 * std::f64::consts::PI * l.wavenumber_cm1 * x).cos()
}
