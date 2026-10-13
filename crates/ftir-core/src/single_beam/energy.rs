//! Energy of the background: the largest value of the background single channel. Compared with the median of the
//! backgrounds of the same instrument (`reference`, given by the caller from its own folder of measurements: the
//! file alone cannot say what a normal background is). Without a reference the check is «not evaluable», and it
//! never blocks: any error while recomputing also gives «not evaluable».
use super::{channel, interferograms, step_of, Channel};
use crate::measurement_quality::{Check, Outcome, Thresholds};
use crate::readers::model::Document;

/// Largest value of a single channel and where it is.
pub fn peak(c: &Channel) -> (f64, f64) {
    c.magnitude
        .iter()
        .zip(&c.wavenumber_cm1)
        .fold(
            (0.0, 0.0),
            |best, (m, x)| {
                if *m > best.0 {
                    (*m, *x)
                } else {
                    best
                }
            },
        )
}

/// Energy of the background of `doc`: `(largest single-channel value, wavenumber of the largest)`.
pub fn background_energy(doc: &Document) -> Option<(f64, f64)> {
    let (_, bg) = interferograms(doc).ok()?;
    let c = channel(&bg.y.values, step_of(bg)?).ok()?;
    Some(peak(&c)).filter(|p| p.0.is_finite() && p.0 > 0.0)
}

/// `background_energy` check: measured = energy / reference, threshold = `low_ratio`.
pub fn check(doc: &Document, t: &Thresholds, reference: Option<f64>) -> Check {
    let limit = t.background_energy.low_ratio;
    let mut c = Check {
        id: "background_energy",
        outcome: Outcome::NotEvaluable,
        severity: None,
        measured: None,
        threshold: limit,
        unit: "ratio",
        at_cm1: None,
    };
    let (Some((energy, at)), Some(reference)) = (background_energy(doc), reference) else {
        return c;
    };
    if !(reference.is_finite() && reference > 0.0) {
        return c;
    }
    let ratio = energy / reference;
    c.measured = Some(ratio);
    c.at_cm1 = Some(at);
    c.outcome = if ratio < limit {
        Outcome::Attention
    } else {
        Outcome::NoSignal
    };
    c
}
