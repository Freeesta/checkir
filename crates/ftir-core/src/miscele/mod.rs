//! Mixtures (package MISCELE): the probable components of a sample, the residual and the peaks nothing explains.
//!
//! The program proposes, the chemist decides. A component's `contribution` is its share of the explained spectrum
//! (area of absorbance), never a weight percentage and never a probability; "what is needed" is the growth of the
//! residual if the component is taken out. Nothing is named to fill the residual: when a lot is left, `high_residual`.
//! Method (data in `soglie_miscele/1`, cuts in `tagli/1`): see `seleziona.rs`; space and references: `spazio.rs`.
use crate::error::{EngineError, EngineResult};
use crate::peaks;
use crate::spectrum::Spectrum;

pub mod dati;
pub mod iterativa;
pub mod nnls;
pub mod residuo;
pub mod risultato;
pub mod seleziona;
pub mod spazio;

pub use dati::{Cuts, Thresholds};
pub use residuo::{BandsCheck, UnexplainedPeak};
pub use spazio::Candidate;

use residuo::{bands_check, on_grid, residual_spectrum, scale_of, unexplained};
use seleziona::{forward, Problem, Selection};

/// Whether a component stays a proposal or is only possible (the bands criterion, when enforced).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Proposed,
    PossibleNotShown,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Component {
    /// Index in the pool given to `analyze`.
    pub candidate: usize,
    pub id: String,
    pub name: String,
    pub substance: Option<String>,
    pub library: String,
    pub is_cut: bool,
    /// Coefficient of the unit-area reference (share of the spectrum area).
    pub weight: f64,
    /// Share of the explained area; the contributions add up to 1.
    pub contribution: f64,
    /// Share of the sample variance explained when it was added.
    pub gain: f64,
    /// Growth of the unexplained variance share if the component is taken out.
    pub needed: f64,
    /// Id of the accepted component this one resembles (derivative r above the limit): a variant, not a substance.
    pub variant_of: Option<String>,
    /// `None` for the first component.
    pub bands: Option<BandsCheck>,
    pub status: Status,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Alert {
    pub id: &'static str,
    pub data: Vec<(String, f64)>,
}

#[derive(Debug, Clone)]
pub struct Mixture {
    pub components: Vec<Component>,
    /// Share of the sample variance (after the background) the components do not explain.
    pub unexplained_share: f64,
    pub background: Vec<f64>,
    pub residual: Spectrum,
    pub unexplained_peaks: Vec<UnexplainedPeak>,
    pub alerts: Vec<Alert>,
    pub candidates_used: usize,
    pub thresholds_version: u32,
    pub cuts_version: u32,
    pub peaks_thresholds_version: u32,
}

fn failed(key: &'static str, why: &str) -> EngineError {
    EngineError::new(key, why)
}

/// Everything the assembly of the result needs.
struct Run<'a> {
    th: &'a Thresholds,
    cuts: &'a Cuts,
    pk: &'a peaks::Thresholds,
    scale: residuo::Scale,
    pool: &'a [Candidate],
    space: spazio::Sample,
    refs: Vec<spazio::Reference>,
    problem: Problem,
}

/// The probable components of `sample` among `pool`: the best `candidates_top` of the simple search plus every cut.
pub fn analyze(
    sample: &Spectrum,
    pool: &[Candidate],
    th: &Thresholds,
    cuts: &Cuts,
    pk: &peaks::Thresholds,
) -> EngineResult<Mixture> {
    let space = spazio::sample_of(sample)?;
    let scale = scale_of(&peaks::detect(sample, pk)?);
    let is_cut = |c: &Candidate| cuts.contains(c.substance.as_deref(), &c.name);
    let mut order = spazio::rank(sample, pool, th.candidates_top)?;
    let cut_ids: Vec<usize> = (0..pool.len())
        .filter(|&i| is_cut(&pool[i]) && !order.contains(&i))
        .collect();
    order.extend(cut_ids);
    let mut refs = Vec::new();
    for &i in &order {
        refs.extend(spazio::reference_of(i, &pool[i], &space, th)?);
    }
    if refs.is_empty() {
        return Err(failed(
            "miscele.nessun_candidato",
            "no candidate covers the sample",
        ));
    }
    let at_rows = |r: &spazio::Reference| -> Vec<f64> {
        let v = |i: usize| {
            if r.area[i].is_finite() {
                r.area[i]
            } else {
                0.0
            }
        };
        space.rows.iter().map(|&i| v(i)).collect()
    };
    let columns = refs.iter().map(at_rows).collect();
    let flags = refs.iter().map(|r| is_cut(&pool[r.index])).collect();
    let y = space.y.clone();
    let problem = Problem::new(y, columns, flags, th.background_order);
    let run = Run {
        th,
        cuts,
        pk,
        scale,
        pool,
        space,
        refs,
        problem,
    };
    let all: Vec<usize> = (0..run.refs.len()).collect();
    let sel = forward(&run.problem, &all, th).ok_or_else(|| {
        failed(
            "miscele.spettro_piatto",
            "no variance left after the background",
        )
    })?;
    run.finish(&sel)
}

impl Run<'_> {
    /// Sample − components − background at the used rows, for the first `picks` candidates with fit `fit`.
    fn residual_at(&self, picks: &[usize], fit: &nnls::Fit) -> Vec<f64> {
        let bg = self.problem.background_of(picks, fit);
        (0..self.space.y.len())
            .map(|r| {
                let parts: f64 = picks
                    .iter()
                    .zip(&fit.x)
                    .map(|(&j, w)| w * self.problem.columns[j][r])
                    .sum();
                self.space.y[r] - parts - bg[r]
            })
            .collect()
    }

    /// Unexplained peaks of the residual left by the first `picks`.
    fn peaks_after(&self, picks: &[usize]) -> EngineResult<Vec<UnexplainedPeak>> {
        let fit = self.problem.fit(picks);
        let res = residual_spectrum(&self.space, &self.residual_at(picks, &fit), Vec::new());
        unexplained(&res, &self.scale, self.pk)
    }

    /// The accepted component this one resembles, if any (variants are not compared with each other).
    fn variant_of(&self, k: usize, done: &[Component]) -> Option<String> {
        let mine = &self.refs[k].deriv;
        done.iter()
            .filter(|c| c.variant_of.is_none())
            .find(|c| {
                let other = self.refs.iter().find(|r| r.index == c.candidate);
                other.is_some_and(|o| {
                    spazio::derivative_r(mine, &o.deriv) >= self.th.derivative_pearson_min
                })
            })
            .map(|c| c.id.clone())
    }

    fn component(&self, sel: &Selection, n: usize, done: &[Component]) -> EngineResult<Component> {
        let chosen: Vec<usize> = sel.picks.iter().map(|p| p.candidate).collect();
        let k = chosen[n];
        let (r, weight) = (&self.refs[k], sel.weights[n]);
        let c = &self.pool[r.index];
        let without: Vec<usize> = chosen.iter().copied().filter(|&j| j != k).collect();
        let bands = if n == 0 {
            None
        } else {
            let curve: Vec<f64> = r.area.iter().map(|v| v * weight).collect();
            Some(bands_check(
                &self.peaks_after(&chosen[..n])?,
                &curve,
                self.th,
            ))
        };
        let status = match &bands {
            Some(b) if self.th.enforce_bands && !b.passed => Status::PossibleNotShown,
            _ => Status::Proposed,
        };
        Ok(Component {
            candidate: r.index,
            id: c.id.clone(),
            name: c.name.clone(),
            substance: c.substance.clone(),
            library: c.library.clone(),
            is_cut: self.cuts.contains(c.substance.as_deref(), &c.name),
            weight,
            contribution: weight / sel.weights.iter().sum::<f64>(),
            gain: sel.picks[n].gain,
            needed: (self.problem.fit(&without).rss - sel.rss) / sel.total,
            variant_of: self.variant_of(k, done),
            bands,
            status,
        })
    }

    fn finish(&self, sel: &Selection) -> EngineResult<Mixture> {
        let chosen: Vec<usize> = sel.picks.iter().map(|p| p.candidate).collect();
        let mut components: Vec<Component> = Vec::new();
        for n in 0..chosen.len() {
            let c = self.component(sel, n, &components)?;
            components.push(c);
        }
        let fit = self.problem.fit(&chosen);
        let notes = components
            .iter()
            .map(|c| {
                format!(
                    "miscela: {}, {}, contributo = {:.3}",
                    c.id, c.library, c.contribution
                )
            })
            .collect();
        let residual = residual_spectrum(&self.space, &self.residual_at(&chosen, &fit), notes);
        let left = unexplained(&residual, &self.scale, self.pk)?;
        let share = sel.rss / sel.total;
        Ok(Mixture {
            alerts: self.alerts(share, left.len()),
            components,
            unexplained_share: share,
            background: on_grid(&self.space, &self.problem.background_of(&chosen, &fit)),
            residual,
            unexplained_peaks: left,
            candidates_used: self.refs.len(),
            thresholds_version: self.th.version,
            cuts_version: self.cuts.version,
            peaks_thresholds_version: self.pk.version,
        })
    }

    fn alerts(&self, share: f64, peaks_left: usize) -> Vec<Alert> {
        let limit = self.th.high_residual_variance_share;
        if share <= limit && peaks_left == 0 {
            return Vec::new();
        }
        vec![Alert {
            id: "high_residual",
            data: vec![
                ("unexplained_variance_share".into(), share),
                ("unexplained_peaks".into(), peaks_left as f64),
                ("limit".into(), limit),
            ],
        }]
    }
}
