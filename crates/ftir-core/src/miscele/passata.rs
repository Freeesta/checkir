//! The assembly of a mixture result from a finished selection (components, residual, alerts).
use super::residuo::{bands_check, on_grid, residual_spectrum, unexplained, UnexplainedPeak};
use super::seleziona::Selection;
use super::{nnls, spazio, Alert, Component, Mixture, Run, Status};
use crate::error::EngineResult;

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

    pub(super) fn finish(&self, sel: &Selection) -> EngineResult<Mixture> {
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
