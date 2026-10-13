//! Pearson correlation on prepared vectors and the comparisons of the registry built on it:
//! `pearson_derivata/1` (first derivative, the ranking score), `pearson_spettro/1` (after the AsLS baseline) and
//! `pearson_regioni/1` (derivative inside each fixed IR region; as one number the weakest region).
use super::{grid_x, prepare, soglie::Thresholds, GRID_N};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;

/// Pearson r of `a` and `b` over the points where both are finite and `sel` (when given) is true.
/// `None` with fewer than 3 points or a constant vector.
pub fn pearson(a: &[f64], b: &[f64], sel: Option<&[bool]>) -> Option<f64> {
    let used = |i: usize| a[i].is_finite() && b[i].is_finite() && sel.is_none_or(|s| s[i]);
    let idx: Vec<usize> = (0..a.len().min(b.len())).filter(|i| used(*i)).collect();
    if idx.len() < 3 {
        return None;
    }
    let n = idx.len() as f64;
    let ma = idx.iter().map(|i| a[*i]).sum::<f64>() / n;
    let mb = idx.iter().map(|i| b[*i]).sum::<f64>() / n;
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for i in idx {
        let (x, y) = (a[i] - ma, b[i] - mb);
        sab += x * y;
        saa += x * x;
        sbb += y * y;
    }
    let den = (saa * sbb).sqrt();
    (den > 1e-300).then(|| (sab / den).clamp(-1.0, 1.0))
}

fn no_common_points() -> EngineError {
    EngineError::new(
        "confronti.nessun_punto_comune",
        "the spectra share too few usable points",
    )
}

/// `pearson_derivata/1`: r between the first derivatives of the `confronto_v1` chain.
pub fn score_derivative(a: &Spectrum, b: &Spectrum) -> EngineResult<f64> {
    pearson(&prepare(a)?.deriv, &prepare(b)?.deriv, None).ok_or_else(no_common_points)
}

/// `pearson_spettro/1`: r between the spectra after the AsLS baseline.
pub fn score_spectrum(a: &Spectrum, b: &Spectrum) -> EngineResult<f64> {
    pearson(&prepare(a)?.spec, &prepare(b)?.spec, None).ok_or_else(no_common_points)
}

/// Selection of the grid points inside `[from, to]` (cm⁻¹, inclusive).
pub fn region_mask(from: f64, to: f64) -> Vec<bool> {
    (0..GRID_N)
        .map(|i| (from..=to).contains(&grid_x(i)))
        .collect()
}

/// `pearson_regioni/1` in detail: the derivative r in each region of the thresholds (`None` = too few points).
pub fn region_scores(
    a: &Spectrum,
    b: &Spectrum,
    t: &Thresholds,
) -> EngineResult<Vec<(String, Option<f64>)>> {
    let (pa, pb) = (prepare(a)?, prepare(b)?);
    Ok(t.regions
        .iter()
        .map(|r| {
            let sel = region_mask(r.from_cm1, r.to_cm1);
            (r.id.clone(), pearson(&pa.deriv, &pb.deriv, Some(&sel)))
        })
        .collect())
}

/// `pearson_regioni/1` as one number: the lowest regional r (where the two spectra agree least).
pub fn score_regions(a: &Spectrum, b: &Spectrum) -> EngineResult<f64> {
    let t = Thresholds::embedded()?;
    region_scores(a, b, &t)?
        .into_iter()
        .filter_map(|(_, r)| r)
        .reduce(f64::min)
        .ok_or_else(no_common_points)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn pearson_is_invariant_to_scale_and_offset_and_sees_anticorrelation() {
        let a: Vec<f64> = (0..50).map(|i| (f64::from(i) * 0.3).sin()).collect();
        let b: Vec<f64> = a.iter().map(|v| 3.0 * v + 7.0).collect();
        let c: Vec<f64> = a.iter().map(|v| -v).collect();
        assert!((pearson(&a, &b, None).unwrap() - 1.0).abs() < 1e-12);
        assert!((pearson(&a, &c, None).unwrap() + 1.0).abs() < 1e-12);
        assert!(pearson(&[1.0; 5], &a[..5], None).is_none());
        assert!(pearson(&a[..2], &b[..2], None).is_none());
    }

    #[test]
    fn nan_and_selection_are_skipped() {
        let a = [1.0, 2.0, f64::NAN, 4.0, 9.0, 3.0];
        let b = [2.0, 4.1, 5.0, 8.0, f64::NAN, 5.9];
        let sel = [true, true, true, true, true, false];
        let r = pearson(&a, &b, Some(&sel)).unwrap();
        assert!(r > 0.99, "{r}");
    }
}
