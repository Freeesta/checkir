//! Artifacts of the environment, labelled only when the quality alert `quality_co2_vapour` is active: a CO₂ peak is
//! looked for inside the excluded zone (the program never hides it, it labels it), and narrow peaks in the ranges of
//! the water vapour lines are marked as probable vapour. The label is a proposal: the chemist decides.
use super::find::find_peaks;
use super::refine::{candidate, Cand};
use super::result::{Artifact, Kind};
use super::thresholds::Thresholds;
use crate::confronti::risultato::Alert;
use crate::spectrum::Spectrum;

const ALERT: &str = "quality_co2_vapour";

fn data_key(alerts: &[Alert], key: &str) -> bool {
    alerts
        .iter()
        .any(|a| a.id == ALERT && a.data.iter().any(|(k, _)| k == key))
}

/// The strongest peak in the CO₂ search range of `spec` (the corrected spectrum with nothing excluded), when the alert
/// found CO₂; `None` otherwise.
pub fn co2(spec: &Spectrum, alerts: &[Alert], sigma: f64, t: &Thresholds) -> Option<Cand> {
    if !data_key(alerts, "co2") {
        return None;
    }
    let (lo, hi) = t.artifacts.co2_search_cm1;
    let idx: Vec<usize> = (0..spec.len())
        .filter(|i| spec.y[*i].is_finite() && (lo..=hi).contains(&spec.wavenumber_cm1[*i]))
        .collect();
    let (x, y): (Vec<f64>, Vec<f64>) = idx
        .iter()
        .map(|i| (spec.wavenumber_cm1[*i], spec.y[*i]))
        .unzip();
    if y.len() < 5 {
        return None;
    }
    let min = t.detect.prominence_noise_ratio * sigma;
    let best = find_peaks(&y, min, 1, t.detect.rel_height)
        .into_iter()
        .max_by(|a, b| a.prominence.total_cmp(&b.prominence))?;
    let mut c = candidate(&x, &y, &best, t.centroid_from_fwhm_cm1, min);
    c.kind = Kind::Peak;
    c.artifact = Some(Artifact::Co2);
    Some(c)
}

/// Marks as probable vapour the narrow peaks inside the vapour ranges, when the alert is active.
pub fn mark_vapour(cands: &mut [Cand], alerts: &[Alert], t: &Thresholds) {
    if !alerts.iter().any(|a| a.id == ALERT) {
        return;
    }
    let a = &t.artifacts;
    for c in cands.iter_mut().filter(|c| c.kind == Kind::Peak) {
        let narrow = c.fwhm.is_some_and(|w| w < a.vapour_max_fwhm_cm1);
        let inside = a
            .vapour_ranges_cm1
            .iter()
            .any(|(lo, hi)| (*lo..=*hi).contains(&c.position));
        if narrow && inside && c.artifact.is_none() {
            c.artifact = Some(Artifact::Vapour);
        }
    }
}
