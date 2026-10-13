//! The library spectrum drawn over the sample (the overlay) and handed to the peak assignment: scaled so that its highest
//! band equals the highest band of the sample, both read outside the excluded zone and inside the points the reference has.

/// Highest finite value of `y` at positions inside `[lo, hi]` and outside the excluded zone; 0 when there is none.
fn top(x: &[f64], y: &[f64], lo: f64, hi: f64, excluded: (f64, f64)) -> f64 {
    x.iter()
        .zip(y)
        .filter(|(v, w)| {
            **v >= lo && **v <= hi && (**v < excluded.0 || **v > excluded.1) && w.is_finite()
        })
        .fold(0.0, |best, (_, w)| if *w > best { *w } else { best })
}

/// Factor that brings the reference to the height of the sample; 1 when either has no positive band to compare.
pub fn reference_scale(
    sample: (&[f64], &[f64]),
    reference: (&[f64], &[f64]),
    excluded: (f64, f64),
) -> f64 {
    let lo = reference.0.iter().copied().fold(f64::INFINITY, f64::min);
    let hi = reference
        .0
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max);
    let own = top(sample.0, sample.1, lo, hi, excluded);
    let theirs = top(reference.0, reference.1, lo, hi, excluded);
    if theirs > 0.0 && own > 0.0 {
        own / theirs
    } else {
        1.0
    }
}

/// The reference values times `reference_scale`.
pub fn reference_scaled(
    sample: (&[f64], &[f64]),
    reference: (&[f64], &[f64]),
    excluded: (f64, f64),
) -> Vec<f64> {
    let k = reference_scale(sample, reference, excluded);
    reference.1.iter().map(|v| v * k).collect()
}
