//! Measurement-quality alerts of the query (`quality_*`): they look at the absorbance spectrum on the comparison grid
//! (before the baseline and the mask) and at the baseline-corrected spectrum. They are warnings, never blocks, and
//! never change the thresholds of the level: the chemist decides, possibly after repeating the measurement. Every
//! alert carries the numbers that raised it; the limits are the provisional ones of `soglie_confronto/1`.
use super::livello::alert;
use super::risultato::Alert;
use super::soglie::{Quality, Thresholds};
use super::{grid_x, masked, GRID_N};
use crate::passi::json::Value;
use crate::passi::savitzky_golay;
use crate::spectrum::Spectrum;

fn num(x: f64) -> Value {
    Value::Num(x)
}

fn points(y: &[f64], band: (f64, f64)) -> impl Iterator<Item = usize> + '_ {
    (0..y.len()).filter(move |i| y[*i].is_finite() && (band.0..=band.1).contains(&grid_x(*i)))
}

/// Standard deviation (n − 1) of the residual `y − smooth` in `band`; `None` with fewer than 10 points.
fn roughness(y: &[f64], smooth: &[f64], band: (f64, f64)) -> Option<f64> {
    let d: Vec<f64> = points(y, band)
        .filter(|i| smooth[*i].is_finite())
        .map(|i| y[i] - smooth[i])
        .collect();
    if d.len() < 10 {
        return None;
    }
    let mean = d.iter().sum::<f64>() / d.len() as f64;
    let var = d.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (d.len() - 1) as f64;
    Some(var.sqrt())
}

fn window_mean(y: &[f64], lo: f64, hi: f64) -> Option<(f64, f64)> {
    let idx: Vec<usize> = points(y, (lo, hi)).collect();
    let n = idx.len() as f64;
    (n > 0.0).then(|| {
        (
            idx.iter().map(|i| grid_x(*i)).sum::<f64>() / n,
            idx.iter().map(|i| y[*i]).sum::<f64>() / n,
        )
    })
}

/// Height of the CO₂ band above a straight line through its two edges, at the highest point.
fn co2_height(y: &[f64], q: &Quality) -> Option<(f64, f64)> {
    let (a, b) = q.co2_band;
    let left = window_mean(y, a - q.co2_edge_cm1, a - 1e-9)?;
    let right = window_mean(y, b + 1e-9, b + q.co2_edge_cm1)?;
    let at = |x: f64| left.1 + (right.1 - left.1) * (x - left.0) / (right.0 - left.0);
    points(y, q.co2_band)
        .map(|i| (y[i] - at(grid_x(i)), grid_x(i)))
        .max_by(|p, r| p.0.total_cmp(&r.0))
}

/// The deepest stretch under `−ratio × noise` outside the mask that is at least `negative_span_cm1` wide:
/// `(minimum, at cm⁻¹, from, to)`.
fn negative_stretch(y: &[f64], limit: f64, span: f64) -> Option<(f64, f64, f64, f64)> {
    let mut best: Option<(f64, f64, f64, f64)> = None;
    let mut run: Vec<usize> = Vec::new();
    for i in 0..=y.len() {
        let below = i < y.len() && !masked(i) && y[i].is_finite() && y[i] < -limit;
        if below {
            run.push(i);
            continue;
        }
        if let (Some(first), Some(last)) = (run.first(), run.last()) {
            let (from, to) = (grid_x(*first), grid_x(*last));
            if to - from >= span {
                let deepest = run.iter().copied().min_by(|a, b| y[*a].total_cmp(&y[*b]));
                if let Some(d) = deepest.filter(|d| best.is_none_or(|b| y[*d] < b.0)) {
                    best = Some((y[d], grid_x(d), from, to));
                }
            }
        }
        run.clear();
    }
    best
}

fn saturation(y: &[f64], q: &Quality) -> Option<Alert> {
    let (i, v) = (0..y.len())
        .filter(|i| !masked(*i) && y[*i].is_finite())
        .map(|i| (i, y[i]))
        .max_by(|a, b| a.1.total_cmp(&b.1))?;
    (v > q.saturation_a).then(|| {
        alert(
            "quality_saturation",
            vec![
                ("max_absorbance", num(v)),
                ("at_cm1", num(grid_x(i))),
                ("limit", num(q.saturation_a)),
            ],
        )
    })
}

fn weak_and_noise(peak: f64, noise: Option<f64>, q: &Quality) -> Vec<Alert> {
    let mut out = Vec::new();
    if peak < q.weak_signal_a {
        out.push(alert(
            "quality_weak_signal",
            vec![
                ("strongest_band", num(peak)),
                ("limit", num(q.weak_signal_a)),
            ],
        ));
    }
    if let Some(n) = noise.filter(|n| *n > 0.0 && peak / n < q.snr_min) {
        out.push(alert(
            "quality_noise",
            vec![
                ("strongest_band", num(peak)),
                ("noise", num(n)),
                ("ratio", num(peak / n)),
                ("limit", num(q.snr_min)),
            ],
        ));
    }
    out
}

fn co2_vapour(y: &[f64], smooth: &[f64], noise: f64, q: &Quality) -> Option<Alert> {
    let mut data = Vec::new();
    if let Some((h, at)) = co2_height(y, q).filter(|h| h.0 > q.co2_noise_ratio * noise) {
        let found = vec![
            ("height", num(h)),
            ("at_cm1", num(at)),
            ("limit_in_noises", num(q.co2_noise_ratio)),
        ];
        data.push(("co2", Value::Obj(to_pairs(found))));
    }
    if let Some(r) =
        roughness(y, smooth, q.vapour_band).filter(|r| *r > q.vapour_noise_ratio * noise)
    {
        let found = vec![
            ("roughness", num(r)),
            ("from_cm1", num(q.vapour_band.0)),
            ("to_cm1", num(q.vapour_band.1)),
            ("limit_in_noises", num(q.vapour_noise_ratio)),
        ];
        data.push(("vapour", Value::Obj(to_pairs(found))));
    }
    if data.is_empty() {
        return None;
    }
    data.push(("noise", num(noise)));
    Some(alert("quality_co2_vapour", data))
}

fn to_pairs(v: Vec<(&str, Value)>) -> Vec<(String, Value)> {
    v.into_iter().map(|(k, x)| (k.to_string(), x)).collect()
}

fn negative(y: &[f64], noise: f64, q: &Quality) -> Option<Alert> {
    let limit = q.negative_noise_ratio * noise;
    let (min, at, from, to) = negative_stretch(y, limit, q.negative_span_cm1)?;
    Some(alert(
        "quality_negative_bands",
        vec![
            ("minimum", num(min)),
            ("at_cm1", num(at)),
            ("from_cm1", num(from)),
            ("to_cm1", num(to)),
            ("noise", num(noise)),
            ("limit_in_noises", num(q.negative_noise_ratio)),
        ],
    ))
}

/// The quality alerts of a query: `grid` = absorbance on the comparison grid, `corrected` = the same after the AsLS
/// baseline (`Prepared::spec`). Alerts that need the noise are skipped when it cannot be measured (too few points).
pub fn quality_alerts(grid: &Spectrum, corrected: &[f64], t: &Thresholds) -> Vec<Alert> {
    let q = &t.quality;
    let y = &grid.y;
    if y.len() != GRID_N {
        return Vec::new();
    }
    let smooth = savitzky_golay::apply(grid, r#"{"window":15,"polyorder":3,"deriv":0}"#)
        .map(|s| s.y)
        .unwrap_or_default();
    let noise = (smooth.len() == GRID_N)
        .then(|| roughness(y, &smooth, q.noise_band))
        .flatten();
    let peak = corrected
        .iter()
        .copied()
        .filter(|v| v.is_finite())
        .fold(f64::NEG_INFINITY, f64::max);
    let mut out: Vec<Alert> = saturation(y, q).into_iter().collect();
    if peak.is_finite() {
        out.extend(weak_and_noise(peak, noise, q));
    }
    if let Some(n) = noise.filter(|n| *n > 0.0) {
        out.extend(co2_vapour(y, &smooth, n, q));
        out.extend(negative(y, n, q));
    }
    out
}
