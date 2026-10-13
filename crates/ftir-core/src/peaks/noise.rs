//! Robust noise: the standard deviation (median absolute deviation × 1.4826) of a residual or a derivative in quiet
//! windows. The lowest window wins, because the others may hold N-H⁺ bands of salts or water vapour; the result is
//! divided by `grid_correction` because on the interpolated grid the MAD underestimates the noise.
use super::thresholds::Noise;

fn median(v: &mut [f64]) -> f64 {
    v.sort_by(f64::total_cmp);
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

/// MAD scaled to a standard deviation; `None` with fewer than `min_points` finite values.
fn mad_sigma(values: &[f64], cfg: &Noise) -> Option<f64> {
    let mut v: Vec<f64> = values.iter().copied().filter(|n| n.is_finite()).collect();
    if v.len() < cfg.min_points {
        return None;
    }
    let m = median(&mut v);
    let mut dev: Vec<f64> = v.iter().map(|n| (n - m).abs()).collect();
    Some(cfg.mad_scale * median(&mut dev))
}

/// Noise of `values` (aligned with the axis `x`): the lowest sigma over the windows of the thresholds file, corrected.
pub fn robust_sigma(values: &[f64], x: &[f64], cfg: &Noise) -> Option<f64> {
    let mut best: Option<f64> = None;
    for &(lo, hi) in &cfg.windows_cm1 {
        let mut start = lo;
        while start + cfg.window_width_cm1 <= hi + 1e-9 {
            let end = start + cfg.window_width_cm1;
            let inside: Vec<f64> = x
                .iter()
                .zip(values)
                .filter(|(xi, _)| (start..=end).contains(*xi))
                .map(|(_, v)| *v)
                .collect();
            if let Some(s) = mad_sigma(&inside, cfg) {
                best = Some(best.map_or(s, |b| b.min(s)));
            }
            start = end;
        }
    }
    best.map(|s| s / cfg.grid_correction)
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::peaks::thresholds::Thresholds;

    #[test]
    fn the_quietest_window_wins_and_the_correction_applies() {
        let cfg = Thresholds::embedded().expect("thresholds").noise;
        let x: Vec<f64> = (0..1576).map(|i| 650.0 + 2.0 * f64::from(i)).collect();
        let loud = |xi: f64| {
            if (2400.0..2500.0).contains(&xi) {
                5.0
            } else {
                1.0
            }
        };
        let v: Vec<f64> = x
            .iter()
            .enumerate()
            .map(|(i, xi)| loud(*xi) * (i % 3) as f64 - loud(*xi))
            .collect();
        let s = robust_sigma(&v, &x, &cfg).expect("sigma");
        assert!((s - 1.4826 / 0.9).abs() < 1e-9, "{s}");
    }

    #[test]
    fn no_window_means_no_noise() {
        let cfg = Thresholds::embedded().expect("thresholds").noise;
        let x: Vec<f64> = (0..100).map(|i| 650.0 + 2.0 * f64::from(i)).collect();
        assert_eq!(robust_sigma(&vec![0.0; 100], &x, &cfg), None);
    }
}
