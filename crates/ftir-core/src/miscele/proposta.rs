//! The gate of a mixture proposal and the search for a minor component (thresholds in `proposal` of `soglie_miscele/1`).
//!
//! A proposal needs at least `min_components` components that are not variants, an unexplained share of the variance
//! not above `max_unexplained_variance_share` and, for each component, at least `min_explained_peaks` sample peaks it
//! explains (bands criterion of `residuo.rs`). Otherwise the result says why there is none: the page never shows a
//! mixture the numbers do not hold up. A minor component is one the forward selection stopped before (its share of the
//! variance is under `stop_variance_share`) that explains peaks the selection left: it is named and marked as minor.
use super::nnls::Fit;
use super::residuo::{bands_check, UnexplainedPeak};
use super::seleziona::{allowed, Pick, Selection};
use super::{Component, Run, Status};
use crate::error::EngineResult;

/// What the page does with the result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Show the mixture.
    Proposed,
    /// There are several components, but the numbers do not hold up: show the reason.
    Rejected,
    /// Nothing that looks like a mixture (fewer than `min_components`): show nothing.
    None,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Proposal {
    pub verdict: Verdict,
    /// `single_component`, `high_residual` or `component_without_peaks`; `None` when proposed.
    pub reason: Option<&'static str>,
    /// Id of the component that explains too few peaks (`component_without_peaks`).
    pub component: Option<String>,
}

impl Run<'_> {
    /// The best allowed candidate not yet chosen that explains enough of the peaks `left` and of the variance.
    fn best_minor(&self, sel: &Selection, left: &[UnexplainedPeak]) -> Option<(usize, Fit)> {
        let chosen: Vec<usize> = sel.picks.iter().map(|p| p.candidate).collect();
        let mut best: Option<(usize, Fit)> = None;
        for j in (0..self.refs.len()).filter(|j| !chosen.contains(j)) {
            if !allowed(&self.problem, &chosen, j) {
                continue;
            }
            let trial: Vec<usize> = chosen.iter().copied().chain([j]).collect();
            let fit = self.problem.fit(&trial);
            let weight = fit.x[chosen.len()];
            let gain = (sel.rss - fit.rss) / sel.total;
            if weight <= 0.0 || gain < self.th.minor_variance_share {
                continue;
            }
            let curve: Vec<f64> = self.refs[j].area.iter().map(|v| v * weight).collect();
            if bands_check(left, &curve, self.th).explained < self.th.proposal_min_explained_peaks {
                continue;
            }
            if best.as_ref().is_none_or(|(_, b)| fit.rss < b.rss) {
                best = Some((j, fit));
            }
        }
        best
    }

    /// After the forward selection: minor components join while peaks are left and there is room.
    pub(super) fn minor_pass(&self, mut sel: Selection) -> EngineResult<Selection> {
        while !sel.picks.is_empty() && sel.picks.len() < self.th.max_components {
            let chosen: Vec<usize> = sel.picks.iter().map(|p| p.candidate).collect();
            let left = self.peaks_after(&chosen)?;
            if left.is_empty() {
                break;
            }
            let Some((j, fit)) = self.best_minor(&sel, &left) else {
                break;
            };
            sel.picks.push(Pick {
                candidate: j,
                gain: (sel.rss - fit.rss) / sel.total,
                minor: true,
            });
            sel.weights = fit.x.iter().take(sel.picks.len()).copied().collect();
            sel.rss = fit.rss;
        }
        Ok(sel)
    }

    /// The gate: is there a mixture to propose, and if not, why.
    pub(super) fn verdict(&self, components: &[Component], share: f64) -> Proposal {
        let main: Vec<&Component> = components
            .iter()
            .filter(|c| c.variant_of.is_none() && c.status == Status::Proposed)
            .collect();
        let weak = main
            .iter()
            .find(|c| c.explained_peaks < self.th.proposal_min_explained_peaks);
        let (verdict, reason, component) = if main.len() < self.th.proposal_min_components {
            (Verdict::None, Some("single_component"), None)
        } else if share > self.th.proposal_max_unexplained_share {
            (Verdict::Rejected, Some("high_residual"), None)
        } else if let Some(c) = weak {
            (
                Verdict::Rejected,
                Some("component_without_peaks"),
                Some(c.id.clone()),
            )
        } else {
            (Verdict::Proposed, None, None)
        };
        Proposal {
            verdict,
            reason,
            component,
        }
    }
}
