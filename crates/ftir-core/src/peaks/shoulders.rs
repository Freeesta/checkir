//! Shoulders: minima of the second derivative (Savitzky–Golay, 9 points) deeper than five times the noise of the
//! derivative, farther than 8 cm⁻¹ from a peak, whose estimated height reaches the detection threshold. The 15-point
//! derivative is too smooth: it separates bands only if they are at least 12–14 cm⁻¹ apart, worse than the raw spectrum.
//!
//! A shoulder has no valley, so its size is estimated from the lobe of the second derivative. For a Lorentzian of
//! height h and half width w the minimum is −2h/w² and the zero crossings are w/√3 from the centre: with Δ the distance
//! between the crossings, h = 3·depth·Δ²/8. A neighbouring band narrows the lobe and fills the minimum, so Δ has a floor
//! (`min_lobe_width_cm1`). Without this test, any flank of a tall band passes a height test.
use super::noise::robust_sigma;
use super::refine::{step, vertex_offset, Cand};
use super::result::Kind;
use super::thresholds::Thresholds;
use crate::error::EngineResult;
use crate::passi::savitzky_golay;
use crate::spectrum::Spectrum;

/// Shoulders of `spec` (absorbance on the ascending grid after the baseline, excluded zones absent). `peaks` are the
/// positions of the peaks already found; `min_height` is the detection threshold in absorbance, applied to the estimated
/// height of the shoulder.
pub fn find(
    spec: &Spectrum,
    peaks: &[f64],
    min_height: f64,
    t: &Thresholds,
) -> EngineResult<Vec<Cand>> {
    let p = &t.shoulders;
    let params = format!(
        r#"{{"window":{},"polyorder":{},"deriv":2}}"#,
        p.derivative_window, p.derivative_polyorder
    );
    let d2 = savitzky_golay::apply(spec, &params)?.y;
    let x = &spec.wavenumber_cm1;
    let Some(sigma) = robust_sigma(&d2, x, &t.noise) else {
        return Ok(Vec::new());
    };
    let limit = (p.depth_noise_ratio * sigma).max(f64::MIN_POSITIVE);
    let mut found: Vec<(f64, Cand)> = Vec::new();
    for i in 1..d2.len().saturating_sub(1) {
        let (a, b, c) = (d2[i - 1], d2[i], d2[i + 1]);
        if !(a.is_finite() && b.is_finite() && c.is_finite()) || !(b < a && b <= c) {
            continue;
        }
        let at = x[i] + vertex_offset(&d2, i) * step(&x[i - 1..]);
        let near = |q: &f64| (q - at).abs() <= p.min_distance_cm1;
        if -b <= limit || peaks.iter().any(near) {
            continue;
        }
        let height = lobe_width(x, &d2, i).map_or(0.0, |w| {
            LORENTZ_LOBE * -b * w.max(p.min_lobe_width_cm1).powi(2)
        });
        if height >= min_height {
            found.push((-b, shoulder(at, spec.y[i], height)));
        }
    }
    Ok(keep_deepest(found, p.min_distance_cm1))
}

/// Factor of the Lorentzian: height = `LORENTZ_LOBE` · depth · (lobe width)².
const LORENTZ_LOBE: f64 = 3.0 / 8.0;

/// Distance between the two zero crossings of the second derivative around the minimum at `i`; `None` when a crossing
/// is missing (the lobe runs into an absent point or the end of the run).
fn lobe_width(x: &[f64], d2: &[f64], i: usize) -> Option<f64> {
    let (mut l, mut r) = (i, i);
    while l > 0 && d2[l] < 0.0 {
        l -= 1;
    }
    while r + 1 < d2.len() && d2[r] < 0.0 {
        r += 1;
    }
    if !(d2[l] >= 0.0 && d2[r] >= 0.0) {
        return None;
    }
    let cross = |a: usize, b: usize| x[a] + (0.0 - d2[a]) / (d2[b] - d2[a]) * (x[b] - x[a]);
    Some(cross(r, r - 1) - cross(l, l + 1))
}

fn shoulder(position: f64, height_at: f64, estimated: f64) -> Cand {
    Cand {
        position,
        height: height_at,
        // A shoulder has no valley to measure a prominence from: the height estimated from its lobe stands in for it.
        prominence: estimated,
        fwhm: None,
        kind: Kind::Shoulder,
        artifact: None,
    }
}

/// Of any group of minima closer than `distance`, only the deepest.
fn keep_deepest(mut found: Vec<(f64, Cand)>, distance: f64) -> Vec<Cand> {
    found.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut kept: Vec<Cand> = Vec::new();
    for (_, c) in found {
        if kept
            .iter()
            .all(|k| (k.position - c.position).abs() > distance)
        {
            kept.push(c);
        }
    }
    kept
}
