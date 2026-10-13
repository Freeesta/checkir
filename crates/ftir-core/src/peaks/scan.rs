//! The scan of one run of present points: maxima with the global and the local prominence rule.
use super::find::{find_peaks, prominence, Found};
use super::refine::{candidate, step, Cand};
use super::thresholds::Thresholds;

/// Maxima of a run, with the two prominence rules of `peak_detect/1`: prominence ≥ `min_prominence` in the whole run,
/// and prominence ≥ `local_min` inside a window of `local_window_cm1` around the maximum. The first rule alone measures
/// peak-to-valley and lets through about seven false peaks per spectrum on pure noise; the second leaves about a quarter.
pub fn scan_found(
    x: &[f64],
    y: &[f64],
    min_prominence: f64,
    local_min: f64,
    t: &Thresholds,
) -> Vec<Found> {
    if y.len() < 3 {
        return Vec::new();
    }
    let dx = step(x).abs();
    let distance = (t.detect.min_distance_cm1 / dx).ceil().max(1.0) as usize;
    let wlen = (t.detect.local_window_cm1 / dx).round() as usize;
    find_peaks(y, min_prominence, distance, t.detect.rel_height)
        .into_iter()
        .filter(|f| prominence(y, f.index, Some(wlen)).0 >= local_min)
        .collect()
}

/// Candidates of a run (see `scan_found`).
pub fn scan_run(
    x: &[f64],
    y: &[f64],
    min_prominence: f64,
    local_min: f64,
    t: &Thresholds,
) -> Vec<Cand> {
    scan_found(x, y, min_prominence, local_min, t)
        .iter()
        .map(|f| candidate(x, y, f, t.centroid_from_fwhm_cm1, local_min))
        .collect()
}

/// Start and end (exclusive) of every stretch of consecutive finite values.
pub fn runs(y: &[f64]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < y.len() {
        if !y[i].is_finite() {
            i += 1;
            continue;
        }
        let end = (i..y.len()).find(|j| !y[*j].is_finite()).unwrap_or(y.len());
        out.push((i, end));
        i = end;
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn runs_split_at_absent_points() {
        let n = f64::NAN;
        assert_eq!(runs(&[n, 1.0, 2.0, n, n, 3.0]), vec![(1, 3), (5, 6)]);
        assert_eq!(runs(&[n, n]), Vec::<(usize, usize)>::new());
    }
}
