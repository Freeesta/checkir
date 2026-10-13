//! The residual of a fit, its unexplained peaks and the acceptance of a component by bands.
//!
//! An unexplained peak is a peak of the residual that is at least `tiers.unexplained_rel_min` of the sample's highest
//! band and at least `prominence_noise_ratio` noise sigmas high (both from `peaks_thresholds/1`, the noise of the
//! sample). The program never names what is left: it only says that something is.
use super::dati::Thresholds;
use super::spazio::Sample;
use crate::confronti::{grid_x, GRID_N};
use crate::error::EngineResult;
use crate::peaks::{self, result::PeakList};
use crate::spectrum::{Role, Spectrum, YUnit};

#[derive(Debug, Clone, PartialEq)]
pub struct UnexplainedPeak {
    pub position_cm1: f64,
    pub height_abs: f64,
    pub prominence_abs: f64,
    pub region_ids: Vec<String>,
}

/// Outcome of the acceptance by bands for one added component (computed and reported; it excludes only if enforced).
#[derive(Debug, Clone, PartialEq)]
pub struct BandsCheck {
    pub unexplained_before: usize,
    pub explained: usize,
    pub passed: bool,
}

/// A grid vector from values at the used rows (`NaN` elsewhere).
pub fn on_grid(sample: &Sample, values: &[f64]) -> Vec<f64> {
    let mut out = vec![f64::NAN; GRID_N];
    for (&i, v) in sample.rows.iter().zip(values) {
        out[i] = *v;
    }
    out
}

pub fn residual_spectrum(sample: &Sample, values: &[f64], notes: Vec<String>) -> Spectrum {
    let x = (0..GRID_N).map(grid_x).collect();
    let mut s = Spectrum::new(
        Role::Residual,
        YUnit::Absorbance,
        x,
        on_grid(sample, values),
    );
    s.history = sample.history.clone();
    s.history.extend(notes);
    s
}

/// Noise and highest band of the sample (from its own peak detection).
pub struct Scale {
    pub noise_abs: f64,
    pub reference_abs: f64,
}

pub fn scale_of(list: &PeakList) -> Scale {
    Scale {
        noise_abs: list.noise_abs,
        reference_abs: list.reference_abs,
    }
}

pub fn unexplained(
    residual: &Spectrum,
    scale: &Scale,
    pk: &peaks::Thresholds,
) -> EngineResult<Vec<UnexplainedPeak>> {
    let list = peaks::detect(residual, pk)?;
    let (min_height, min_prom) = (
        pk.tiers.unexplained_rel_min * scale.reference_abs,
        pk.detect.prominence_noise_ratio * scale.noise_abs,
    );
    Ok(list
        .peaks
        .into_iter()
        .filter(|p| p.artifact.is_none())
        .filter(|p| p.height_abs >= min_height && p.prominence_abs >= min_prom)
        .map(|p| UnexplainedPeak {
            position_cm1: p.position_cm1,
            height_abs: p.height_abs,
            prominence_abs: p.prominence_abs,
            region_ids: p.region_ids,
        })
        .collect())
}

/// Does the contribution curve `contribution` (grid, `NaN` = absent) explain each peak of `before`?
pub fn bands_check(
    before: &[UnexplainedPeak],
    contribution: &[f64],
    th: &Thresholds,
) -> BandsCheck {
    let explained = before
        .iter()
        .filter(|p| {
            (0..GRID_N)
                .filter(|&i| (grid_x(i) - p.position_cm1).abs() <= th.bands_tolerance_cm1)
                .filter_map(|i| contribution.get(i).copied().filter(|v| v.is_finite()))
                .fold(0.0, f64::max)
                >= th.bands_explained_fraction * p.height_abs
        })
        .count();
    BandsCheck {
        unexplained_before: before.len(),
        explained,
        passed: explained > 0,
    }
}
