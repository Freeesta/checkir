//! Iterative subtraction: "subtract the first hit and search again on the residual", up to `max_rounds` rounds.
//!
//! Each round takes the best hit of the simple search on the current spectrum (a hit already used is not offered
//! again), proposes its factor with `fattore_proposto` (background fitted together, factor never negative) and
//! subtracts it with `subtract` (`sottrazione/1`); at the end the factors of all the hits are fitted together and the
//! subtraction is replayed with them (a sequential subtraction carries the bias of its order). The loop stops when the proposed factor is 0 or the round explains
//! less than `stop_variance_share` of the sample variance (after the baseline). A round that pushes the residual
//! under minus `over_subtraction_noise_ratio` noise sigmas where the reference is strong is flagged `over_subtraction`:
//! the factor is too large, the chemist lowers it. The factors are the ones of the steps (references as supplied,
//! not rescaled), and they come from a sequential subtraction, so each carries the small bias of the order before it.
use super::dati::Thresholds;
use super::nnls;
use super::residuo::{scale_of, unexplained, UnexplainedPeak};
use super::spazio::{self, Candidate};
use super::Alert;
use crate::confronti::{masked, GRID_N};
use crate::error::EngineResult;
use crate::passi::sottrazione::{fattore_proposto, subtract, Subtraction};
use crate::passi::{griglia, linea_di_base_asls, savitzky_golay, trasmittanza};
use crate::peaks;
use crate::spectrum::Spectrum;

#[derive(Debug, Clone, PartialEq)]
pub struct Round {
    /// Index in the pool.
    pub candidate: usize,
    pub id: String,
    pub name: String,
    pub library: String,
    pub k: f64,
    /// Share of the sample variance this round explained.
    pub gain: f64,
    /// Minimum of the residual where the reference is strong.
    pub zone_minimum: Option<f64>,
    pub over_subtraction: bool,
}

#[derive(Debug, Clone)]
pub struct Iteration {
    pub rounds: Vec<Round>,
    pub residual: Spectrum,
    pub unexplained_share: f64,
    pub unexplained_peaks: Vec<UnexplainedPeak>,
    pub alerts: Vec<Alert>,
    pub thresholds_version: u32,
}

/// Sum of squares of the finite points outside the mask.
fn sum_squares(s: &Spectrum) -> f64 {
    (0..GRID_N.min(s.len()))
        .filter(|&i| !masked(i) && s.y[i].is_finite())
        .map(|i| s.y[i] * s.y[i])
        .sum()
}

fn label(text: &str) -> String {
    text.replace(['"', '\\'], "")
}

fn params(k: f64, c: &Candidate) -> String {
    format!(
        r#"{{"k":{k},"baseline":false,"reference_id":"{}","library":"{}"}}"#,
        label(&c.id),
        label(&c.library)
    )
}

/// Absorbance on the default grid with the AsLS baseline removed (what `sottrazione/1` does with `baseline: true`);
/// done here once per spectrum so a residual is not corrected again in the next round.
fn prepared(s: &Spectrum) -> EngineResult<Spectrum> {
    let a = trasmittanza::to_absorbance(s, "{}")?;
    linea_di_base_asls::apply(&griglia::apply(&a, "{}")?, "{}")
}

/// Minimum of the smoothed residual where the reference exceeds `reference_zone_fraction` of its maximum: a band that
/// goes negative there is over-subtraction (smoothing keeps one noisy point from raising the alarm).
fn zone_minimum(
    residual: &Spectrum,
    reference: &Spectrum,
    th: &Thresholds,
) -> EngineResult<Option<f64>> {
    let p = format!(
        r#"{{"window":{},"polyorder":{},"deriv":0}}"#,
        th.smooth_window, th.smooth_polyorder
    );
    let smooth = savitzky_golay::apply(residual, &p)?;
    let top = reference
        .y
        .iter()
        .zip(&residual.y)
        .filter(|(r, c)| r.is_finite() && c.is_finite())
        .fold(0.0f64, |m, (r, _)| m.max(*r));
    Ok(smooth
        .y
        .iter()
        .zip(&reference.y)
        .enumerate()
        .filter(|(i, (y, r))| {
            !masked(*i) && y.is_finite() && **r > th.reference_zone_fraction * top
        })
        .map(|(_, (y, _))| *y)
        .fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.min(v)))))
}

/// A reference picked by the search, already prepared.
struct Pick {
    index: usize,
    reference: Spectrum,
}

/// The search: best hit of the simple search on the current spectrum, its proposed factor, subtract, repeat.
/// Returns the picks in order; a round that explains less than `round_stop_variance_share` is not kept.
fn search(start: &Spectrum, pool: &[Candidate], th: &Thresholds) -> EngineResult<Vec<Pick>> {
    let total = sum_squares(start);
    let (mut current, mut last_ss) = (start.clone(), total);
    let mut left: Vec<usize> = (0..pool.len()).collect();
    let mut picks = Vec::new();
    for _ in 0..th.max_rounds {
        let shortlist: Vec<Candidate> = left.iter().map(|&i| pool[i].clone()).collect();
        let Some(&first) = spazio::rank(&current, &shortlist, 1)?.first() else {
            break;
        };
        let index = left[first];
        let reference = prepared(&pool[index].spectrum)?;
        let proposal = fattore_proposto(&current, &reference, r#"{"baseline":false}"#)?;
        if proposal.k <= 0.0 {
            break;
        }
        let k = params(proposal.k, &pool[index]);
        let residual = subtract(&current, &reference, &k)?.residual;
        let ss = sum_squares(&residual);
        let gained = (last_ss - ss) / total;
        if gained.is_nan() || gained < th.round_stop_variance_share {
            break;
        }
        (current, last_ss) = (residual, ss);
        left.retain(|&i| i != index);
        picks.push(Pick { index, reference });
    }
    Ok(picks)
}

/// The factors of all picks fitted together (non-negative least squares on the prepared sample), rounded to 0.01.
/// A sequential subtraction carries the bias of the order it was done in; fitting them together removes it.
fn refit(start: &Spectrum, picks: &[Pick]) -> Vec<f64> {
    let rows: Vec<usize> = (0..GRID_N.min(start.len()))
        .filter(|&i| !masked(i) && start.y[i].is_finite())
        .filter(|&i| {
            picks
                .iter()
                .all(|p| p.reference.y.get(i).is_some_and(|v| v.is_finite()))
        })
        .collect();
    let columns: Vec<Vec<f64>> = picks
        .iter()
        .map(|p| rows.iter().map(|&i| p.reference.y[i]).collect())
        .collect();
    let refs: Vec<&[f64]> = columns.iter().map(Vec::as_slice).collect();
    let b: Vec<f64> = rows.iter().map(|&i| start.y[i]).collect();
    nnls::solve(&refs, &b)
        .x
        .iter()
        .map(|k| (k * 100.0).round() / 100.0)
        .collect()
}

pub fn run(
    sample: &Spectrum,
    pool: &[Candidate],
    th: &Thresholds,
    pk: &peaks::Thresholds,
) -> EngineResult<Iteration> {
    let scale = scale_of(&peaks::detect(sample, pk)?);
    let start = prepared(sample)?;
    let total = sum_squares(&start);
    let picks = search(&start, pool, th)?;
    let factors = refit(&start, &picks);
    let (mut current, mut last_ss) = (start, total);
    let mut rounds = Vec::new();
    for (pick, &k) in picks.iter().zip(&factors).filter(|(_, k)| **k > 0.0) {
        let c = &pool[pick.index];
        let Subtraction { residual, .. } = subtract(&current, &pick.reference, &params(k, c))?;
        let zone_minimum = zone_minimum(&residual, &pick.reference, th)?;
        let ss = sum_squares(&residual);
        rounds.push(Round {
            candidate: pick.index,
            id: c.id.clone(),
            name: c.name.clone(),
            library: c.library.clone(),
            k,
            gain: (last_ss - ss) / total,
            zone_minimum,
            over_subtraction: zone_minimum
                .is_some_and(|m| m < -th.over_subtraction_noise_ratio * scale.noise_abs),
        });
        (current, last_ss) = (residual, ss);
    }
    finish(rounds, current, (total, last_ss), th, pk, &scale)
}

fn finish(
    rounds: Vec<Round>,
    residual: Spectrum,
    (total, last_ss): (f64, f64),
    th: &Thresholds,
    pk: &peaks::Thresholds,
    scale: &super::residuo::Scale,
) -> EngineResult<Iteration> {
    let share = if total > 0.0 { last_ss / total } else { 1.0 };
    let unexplained_peaks = if rounds.is_empty() {
        Vec::new()
    } else {
        unexplained(&residual, scale, pk)?
    };
    let mut alerts = Vec::new();
    for (n, r) in rounds
        .iter()
        .enumerate()
        .filter(|(_, r)| r.over_subtraction)
    {
        alerts.push(Alert {
            id: "over_subtraction",
            data: vec![
                ("round".into(), (n + 1) as f64),
                ("zone_minimum".into(), r.zone_minimum.unwrap_or(f64::NAN)),
                ("noise_abs".into(), scale.noise_abs),
            ],
        });
    }
    if !rounds.is_empty()
        && (share > th.high_residual_variance_share || !unexplained_peaks.is_empty())
    {
        alerts.push(Alert {
            id: "high_residual",
            data: vec![
                ("unexplained_variance_share".into(), share),
                ("unexplained_peaks".into(), unexplained_peaks.len() as f64),
                ("limit".into(), th.high_residual_variance_share),
            ],
        });
    }
    Ok(Iteration {
        rounds,
        residual,
        unexplained_share: share,
        unexplained_peaks,
        alerts,
        thresholds_version: th.version,
    })
}
