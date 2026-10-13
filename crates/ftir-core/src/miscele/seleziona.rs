//! Forward selection of the components (method `forward_selection_absorbance`, rule of the single active).
//!
//! The design matrix holds the candidate columns (coefficient ≥ 0) and a polynomial background of free sign (each power
//! of x in [−1, 1] and its opposite), solved together by NNLS. At each step the candidate that lowers the residual sum
//! of squares most is added, provided it explains at least `stop_variance_share` of the sample variance left after the
//! background alone. At most one component outside the cut list; a second one enters only if it explains at least
//! `second_active_variance_share`, otherwise the best allowed candidate is tried. Cuts are always allowed.
use super::dati::Thresholds;
use super::nnls::{self, Fit};

/// What the selection works on: the sample at the used rows, one column per candidate (same rows) and the cut flags.
pub struct Problem {
    pub y: Vec<f64>,
    pub columns: Vec<Vec<f64>>,
    pub is_cut: Vec<bool>,
    background: Vec<Vec<f64>>,
}

/// One accepted component.
#[derive(Debug, Clone, PartialEq)]
pub struct Pick {
    pub candidate: usize,
    /// Share of the sample variance it explained when it was added.
    pub gain: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Selection {
    pub picks: Vec<Pick>,
    /// Coefficients of the picks (share of the spectrum area), in the order of `picks`.
    pub weights: Vec<f64>,
    /// Sum of squares of the sample after the background alone.
    pub total: f64,
    /// Sum of squares of the final residual.
    pub rss: f64,
}

impl Problem {
    pub fn new(y: Vec<f64>, columns: Vec<Vec<f64>>, is_cut: Vec<bool>, order: usize) -> Self {
        let n = y.len();
        let x = |i: usize| 2.0 * i as f64 / (n - 1) as f64 - 1.0;
        let pos: Vec<Vec<f64>> = (0..=order)
            .map(|p| (0..n).map(|i| x(i).powi(p as i32)).collect())
            .collect();
        let neg = pos.iter().map(|c| c.iter().map(|v| -v).collect());
        let background = pos.iter().cloned().chain(neg).collect();
        Self {
            y,
            columns,
            is_cut,
            background,
        }
    }

    /// NNLS of the sample on the chosen candidates plus the background.
    pub fn fit(&self, chosen: &[usize]) -> Fit {
        let cols: Vec<&[f64]> = chosen
            .iter()
            .map(|&j| self.columns[j].as_slice())
            .chain(self.background.iter().map(Vec::as_slice))
            .collect();
        nnls::solve(&cols, &self.y)
    }

    /// The fitted background `Σ cₚ xᵖ` at the rows (the free-sign pairs folded back).
    pub fn background_of(&self, chosen: &[usize], fit: &Fit) -> Vec<f64> {
        let k = chosen.len();
        let powers = self.background.len() / 2;
        let mut out = vec![0.0; self.y.len()];
        for p in 0..powers {
            let c = fit.x[k + p] - fit.x[k + powers + p];
            for (o, v) in out.iter_mut().zip(&self.background[p]) {
                *o += c * v;
            }
        }
        out
    }
}

struct Trial {
    candidate: usize,
    fit: Fit,
}

/// Rule of the single active: a cut may always join; a non-cut only if `sel` holds no non-cut yet.
fn allowed(p: &Problem, sel: &[usize], j: usize) -> bool {
    p.is_cut[j] || sel.iter().all(|&k| p.is_cut[k])
}

fn best_of(trials: &[Trial], keep: impl Fn(&Trial) -> bool) -> Option<&Trial> {
    trials
        .iter()
        .filter(|t| keep(t))
        .fold(None, |m: Option<&Trial>, t| match m {
            Some(b) if b.fit.rss <= t.fit.rss => Some(b),
            _ => Some(t),
        })
}

pub fn forward(p: &Problem, pool: &[usize], th: &Thresholds) -> Option<Selection> {
    let base = p.fit(&[]);
    let total = base.rss;
    let energy: f64 = p.y.iter().map(|v| v * v).sum();
    if !(total > 1e-12 * energy && total.is_finite()) {
        return None;
    }
    let (mut sel, mut gains): (Vec<usize>, Vec<f64>) = (Vec::new(), Vec::new());
    let (mut res_var, mut last) = (total, base);
    for _ in 0..th.max_components {
        let trials: Vec<Trial> = pool
            .iter()
            .filter(|j| !sel.contains(j))
            .map(|&j| {
                let chosen: Vec<usize> = sel.iter().copied().chain([j]).collect();
                Trial {
                    candidate: j,
                    fit: p.fit(&chosen),
                }
            })
            .collect();
        let share = |t: &Trial| (res_var - t.fit.rss) / total;
        let positive = |t: &Trial| t.fit.x[sel.len()] > 0.0;
        let Some(best) = best_of(&trials, |_| true) else {
            break;
        };
        let second_active = !p.is_cut[best.candidate] && !allowed(p, &sel, best.candidate);
        let need = if second_active {
            th.second_active_variance_share
        } else {
            th.stop_variance_share
        };
        let chosen = if share(best) >= need {
            best
        } else {
            match best_of(&trials, |t| allowed(p, &sel, t.candidate)) {
                Some(alt) if share(alt) >= th.stop_variance_share && positive(alt) => alt,
                _ => break,
            }
        };
        if !positive(chosen) {
            break;
        }
        gains.push(share(chosen));
        sel.push(chosen.candidate);
        res_var = chosen.fit.rss;
        last = Fit {
            x: chosen.fit.x.clone(),
            rss: chosen.fit.rss,
        };
    }
    let weights = last.x.iter().take(sel.len()).copied().collect();
    Some(Selection {
        picks: sel
            .iter()
            .zip(gains)
            .map(|(&candidate, gain)| Pick { candidate, gain })
            .collect(),
        weights,
        total,
        rss: res_var,
    })
}
