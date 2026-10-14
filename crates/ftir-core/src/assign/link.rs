//! Links of a peak to the data of the candidate and to the common cuts: the assignment of a band of the substance
//! (`substance-bands/2`) and the suspects (`tagli/2` with diagnostic bands).
use super::context::{Context, Cut, SubstanceBand};
use super::result::Interpretation;
use super::{tolerance, usable, PeakSet, MAX_SUSPECTS};
use crate::peaks::result::Peak;
use crate::peaks::Thresholds;

/// The assignment of the band of `substance`/`form` that contains `cm1` (nearest first), if the file has one.
pub fn band_at<'a>(
    ctx: &'a Context,
    substance: &str,
    form: &str,
    cm1: f64,
) -> Option<&'a SubstanceBand> {
    let set =
        (ctx.substance_bands.iter()).find(|s| s.substance_id == substance && s.form == form)?;
    (set.bands.iter())
        .filter(|b| (b.position_cm1 - cm1).abs() <= b.tolerance_cm1)
        .min_by(|a, b| {
            let d = |x: &SubstanceBand| (x.position_cm1 - cm1).abs();
            d(a).total_cmp(&d(b))
        })
}

/// Interpretation made of an assignment of the substance: for a peak the spectrum of the reference does not explain.
pub fn from_band(b: &SubstanceBand) -> Interpretation {
    Interpretation {
        rule_id: None,
        group: b.group.clone(),
        mode: b.mode.clone(),
        rank: 0,
        status: b.status.clone(),
        origin: Some(b.origin.id()),
    }
}

fn near(cut: &Cut, p: &Peak, t: &Thresholds) -> bool {
    let tol = tolerance(t, p.shape);
    (cut.bands.iter()).any(|(at, own)| (at - p.position_cm1).abs() <= own.unwrap_or(tol))
}

/// Cuts with a diagnostic band at `p`, those with more bands present in the sample first; never more than
/// `MAX_SUSPECTS`, never a cut that is already a reference. A hint to try the subtraction, never an identification.
pub fn suspects(
    p: &Peak,
    sample: &PeakSet,
    cuts: &[Cut],
    known: &[&str],
    t: &Thresholds,
) -> Vec<String> {
    let mut found: Vec<(usize, &Cut)> = (cuts.iter())
        .filter(|c| !known.contains(&c.id.as_str()) && near(c, p, t))
        .map(|c| {
            let present = (sample.peaks.iter()).filter(|q| usable(q) && near(c, q, t));
            (present.count(), c)
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.id.cmp(&b.1.id)));
    found
        .into_iter()
        .take(MAX_SUSPECTS)
        .map(|(_, c)| c.id.clone())
        .collect()
}
