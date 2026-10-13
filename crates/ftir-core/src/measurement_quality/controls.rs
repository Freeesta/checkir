//! The three checks on the absorbance spectrum. Each returns a `Check` with the measured value and the limit, whatever
//! the outcome; none of them can block anything.
use super::thresholds::{Co2, Negative, Thresholds, Vapour};
use super::{Check, Outcome};
use crate::spectrum::Spectrum;

fn inside(x: f64, band: (f64, f64)) -> bool {
    (band.0..=band.1).contains(&x)
}

fn in_band(s: &Spectrum, band: (f64, f64)) -> Vec<usize> {
    (0..s.len())
        .filter(|i| s.y[*i].is_finite() && inside(s.wavenumber_cm1[*i], band))
        .collect()
}

fn median(v: &mut [f64]) -> f64 {
    v.sort_by(|a, b| a.total_cmp(b));
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

/// Median point `(centre of the window, median y)` of a flank; `None` with fewer than 3 points.
fn flank(s: &Spectrum, band: (f64, f64)) -> Option<(f64, f64)> {
    let idx = in_band(s, band);
    if idx.len() < 3 {
        return None;
    }
    let mut y: Vec<f64> = idx.iter().map(|i| s.y[*i]).collect();
    Some(((band.0 + band.1) / 2.0, median(&mut y)))
}

fn check(id: &'static str, threshold: f64, unit: &'static str) -> Check {
    Check {
        id,
        outcome: Outcome::NotEvaluable,
        severity: None,
        measured: None,
        threshold,
        unit,
        at_cm1: None,
    }
}

/// Residual CO₂: largest deviation from the local line through the two flanks, inside the CO₂ band.
pub fn co2(s: &Spectrum, t: &Co2) -> Check {
    let mut c = check("co2", t.max_deviation_abs, "A");
    let (a, b) = (flank(s, t.flanks_cm1[0]), flank(s, t.flanks_cm1[1]));
    let idx = in_band(s, t.band_cm1);
    let (Some(a), Some(b)) = (a, b) else { return c };
    if idx.len() < t.min_points {
        return c;
    }
    let slope = (b.1 - a.1) / (b.0 - a.0);
    let dev = |i: usize| s.y[i] - (a.1 + slope * (s.wavenumber_cm1[i] - a.0));
    let worst = idx
        .iter()
        .copied()
        .max_by(|p, q| dev(*p).abs().total_cmp(&dev(*q).abs()));
    let Some(w) = worst else { return c };
    c.measured = Some(dev(w).abs());
    c.at_cm1 = Some(s.wavenumber_cm1[w]);
    c.outcome = if dev(w).abs() > t.max_deviation_abs {
        Outcome::Attention
    } else {
        Outcome::NoSignal
    };
    c
}

/// Water vapour: standard deviation of the first derivative (A per cm⁻¹) in the band, against a multiple of the
/// median roughness of a clean reference set.
pub fn vapour(s: &Spectrum, t: &Vapour) -> Check {
    let limit = t.roughness_ratio * t.reference_median_roughness;
    let mut c = check("vapour", limit, "A/cm-1");
    let idx = in_band(s, t.band_cm1);
    let d: Vec<f64> = idx
        .windows(2)
        .filter(|w| w[1] == w[0] + 1)
        .map(|w| (s.y[w[1]] - s.y[w[0]]) / (s.wavenumber_cm1[w[1]] - s.wavenumber_cm1[w[0]]).abs())
        .filter(|v| v.is_finite())
        .collect();
    if d.len() < t.min_points {
        return c;
    }
    let mean = d.iter().sum::<f64>() / d.len() as f64;
    let var = d.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (d.len() - 1) as f64;
    c.measured = Some(var.sqrt());
    c.outcome = if var.sqrt() > limit {
        Outcome::Attention
    } else {
        Outcome::NoSignal
    };
    c
}

/// Negative bands: the lowest value outside the excluded ranges (the CO₂ region is excluded).
pub fn negative(s: &Spectrum, t: &Negative) -> Check {
    let mut c = check("negative", t.min_abs, "A");
    let lowest = (0..s.len())
        .filter(|i| {
            s.y[*i].is_finite()
                && !t
                    .excluded_cm1
                    .iter()
                    .any(|r| inside(s.wavenumber_cm1[*i], *r))
        })
        .min_by(|a, b| s.y[*a].total_cmp(&s.y[*b]));
    let Some(i) = lowest else { return c };
    c.measured = Some(s.y[i]);
    c.at_cm1 = Some(s.wavenumber_cm1[i]);
    if s.y[i] < t.min_abs {
        c.outcome = Outcome::Attention;
        c.severity = (s.y[i] < t.strong_min_abs).then_some("strong");
    } else {
        c.outcome = Outcome::NoSignal;
    }
    c
}

pub fn run(s: &Spectrum, t: &Thresholds) -> Vec<Check> {
    vec![
        co2(s, &t.co2),
        vapour(s, &t.vapour),
        negative(s, &t.negative),
    ]
}
