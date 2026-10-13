//! Spectrum from an interferogram: truncation at OPD_max, apodization, zero-filling, FFT.
//! Didactic calculation (no phase correction): it is not the calculation of any instrument software.

use super::apodization::Apodization;
use super::fft::fft;
use super::interferogram::Interferogram;
use super::{check_positive, MAX_POINTS};
use crate::error::{EngineError, EngineResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Output {
    /// Real part of the transform (exact for a symmetric interferogram).
    Real,
    /// Modulus (removes a constant phase; the only choice for a real, asymmetric interferogram).
    Magnitude,
}

#[derive(Debug, Clone, Copy)]
pub struct Options {
    /// Interferogram samples beyond |OPD| > `opd_max_cm` are dropped.
    pub opd_max_cm: f64,
    pub apodization: Apodization,
    /// Power-of-two factor on the padded length (1 = none).
    pub zero_fill: usize,
    pub output: Output,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ComputedSpectrum {
    pub wavenumber_cm1: Vec<f64>,
    pub intensity: Vec<f64>,
    /// Nominal resolution 1 / OPD_max (cm-1).
    pub resolution_cm1: f64,
    /// Spacing of the output points (cm-1); smaller than the resolution only through zero-filling.
    pub point_spacing_cm1: f64,
}

/// A line of amplitude `a` exactly on an output point gives a peak of height `a`.
pub fn spectrum_from_interferogram(
    ifg: &Interferogram,
    opts: &Options,
) -> EngineResult<ComputedSpectrum> {
    let step = check_positive("step_cm", ifg.step_cm)?;
    let opd_max = check_positive("opd_max_cm", opts.opd_max_cm)?;
    let n = ifg.intensity.len();
    if n == 0 || ifg.zpd_index >= n {
        return Err(EngineError::new("didactic.empty", "no data"));
    }
    if !opts.zero_fill.is_power_of_two() {
        return Err(EngineError::new(
            "didactic.zero_fill",
            "the zero-fill factor must be a power of two",
        )
        .with_param("value", opts.zero_fill));
    }
    let len = n.next_power_of_two().saturating_mul(opts.zero_fill);
    if len > MAX_POINTS {
        return Err(EngineError::new(
            "didactic.too_many_points",
            "the padded length is out of range",
        )
        .with_param("limit", MAX_POINTS));
    }
    let mut re = vec![0.0; len];
    let mut im = vec![0.0; len];
    let mut weights = 0.0;
    for (j, v) in ifg.intensity.iter().enumerate() {
        let x = ifg.opd_cm(j).abs();
        if x > opd_max * (1.0 + 1e-9) {
            continue;
        }
        let w = opts.apodization.weight((x / opd_max).min(1.0));
        weights += w;
        // Negative path differences wrap to the end of the array: the zero path difference is at index 0.
        re[(j + len - ifg.zpd_index) % len] = v * w;
    }
    if weights <= 0.0 {
        return Err(EngineError::new("didactic.empty", "no data inside OPD_max"));
    }
    fft(&mut re, &mut im)?;
    let spacing = 1.0 / (len as f64 * step);
    let scale = 2.0 / weights;
    let intensity = (0..=len / 2)
        .map(|k| match opts.output {
            Output::Real => re[k] * scale,
            Output::Magnitude => re[k].hypot(im[k]) * scale,
        })
        .collect();
    Ok(ComputedSpectrum {
        wavenumber_cm1: (0..=len / 2).map(|k| k as f64 * spacing).collect(),
        intensity,
        resolution_cm1: 1.0 / opd_max,
        point_spacing_cm1: spacing,
    })
}
