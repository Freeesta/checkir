//! The space the fit works in: absorbance on the comparison grid (650–3800 cm⁻¹, step 2), outside the mask 1900–2400.
//!
//! The sample is used as measured (no baseline step): the background is estimated together with the components, so it
//! cannot distort their factors. Each reference is AsLS-corrected, cut at 0 and brought to unit area over the compared
//! points, so its fitted coefficient is its share of the spectrum area (not a weight fraction).
use super::dati::Thresholds;
use crate::confronti::{asls, grid_absorbance, grid_x, masked, pearson::pearson, GRID_N};
use crate::error::{EngineError, EngineResult};
use crate::passi::catene::{self, CONFRONTO_V1};
use crate::passi::savitzky_golay;
use crate::spectrum::{Role, Spectrum, YUnit};

fn unusable(why: &str) -> EngineError {
    EngineError::new("miscele.spettro_non_utilizzabile", why)
}

/// A library spectrum offered to the search: what the page knows about it plus the spectrum.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub id: String,
    pub substance: Option<String>,
    pub name: String,
    pub library: String,
    pub spectrum: Spectrum,
}

/// A candidate ready for the fit. `area` and `deriv` have `GRID_N` values, `NaN` where masked or absent.
#[derive(Debug, Clone)]
pub struct Reference {
    pub index: usize,
    pub area: Vec<f64>,
    pub deriv: Vec<f64>,
}

/// The sample on the grid: `rows` are the grid indices used, `y` its absorbance there.
#[derive(Debug, Clone)]
pub struct Sample {
    pub rows: Vec<usize>,
    pub y: Vec<f64>,
    pub history: Vec<String>,
}

pub fn sample_of(s: &Spectrum) -> EngineResult<Sample> {
    let g = grid_absorbance(s).ok_or_else(|| unusable("no usable absorbance on the grid"))?;
    let rows: Vec<usize> = (0..GRID_N)
        .filter(|&i| !masked(i) && g.y.get(i).is_some_and(|v| v.is_finite()))
        .collect();
    if rows.len() < 100 {
        return Err(unusable("fewer than 100 points outside the mask"));
    }
    let y = rows.iter().map(|&i| g.y[i]).collect();
    Ok(Sample {
        rows,
        y,
        history: s.history.clone(),
    })
}

/// First derivative (Savitzky–Golay) of a grid vector, `NaN` at the masked points.
pub fn derivative(y: &[f64], th: &Thresholds) -> EngineResult<Vec<f64>> {
    let x: Vec<f64> = (0..GRID_N).map(grid_x).collect();
    let s = Spectrum::new(Role::Reference, YUnit::Absorbance, x, y.to_vec());
    let p = format!(
        r#"{{"window":{},"polyorder":{},"deriv":1}}"#,
        th.smooth_window, th.smooth_polyorder
    );
    let d = savitzky_golay::apply(&s, &p)?;
    Ok(d.y
        .iter()
        .enumerate()
        .map(|(i, v)| if masked(i) { f64::NAN } else { *v })
        .collect())
}

/// AsLS-corrected, non-negative, unit-area reference on the grid. `None` if it is empty or too short to correct.
pub fn reference_of(
    index: usize,
    c: &Candidate,
    sample: &Sample,
    th: &Thresholds,
) -> EngineResult<Option<Reference>> {
    let Some(g) = grid_absorbance(&c.spectrum) else {
        return Ok(None);
    };
    let Some(base) = asls::baseline(&g.y, &asls::DEFAULT) else {
        return Ok(None);
    };
    let full: Vec<f64> =
        g.y.iter()
            .zip(&base)
            .map(|(y, b)| {
                if y.is_finite() {
                    (y - b).max(0.0)
                } else {
                    f64::NAN
                }
            })
            .collect();
    let covered = sample.rows.iter().filter(|&&i| full[i].is_finite()).count();
    let area: f64 = sample
        .rows
        .iter()
        .map(|&i| full[i])
        .filter(|v| v.is_finite())
        .sum();
    if (covered as f64) < th.min_reference_coverage * sample.rows.len() as f64 || area <= 0.0 {
        return Ok(None);
    }
    let scaled: Vec<f64> = full.iter().map(|v| v / area).collect();
    let deriv = derivative(&scaled, th)?;
    let area_vec = scaled
        .iter()
        .enumerate()
        .map(|(i, v)| if masked(i) { f64::NAN } else { *v })
        .collect();
    Ok(Some(Reference {
        index,
        area: area_vec,
        deriv,
    }))
}

/// Pearson r between two grid derivatives over the points present in both.
pub fn derivative_r(a: &[f64], b: &[f64]) -> f64 {
    pearson(a, b, None).unwrap_or(f64::NAN)
}

/// Indices of the `top` pool entries whose derivative (chain `confronto_v1`, the simple search) is most like the
/// sample's, best first; ties keep the pool order.
pub fn rank(sample: &Spectrum, pool: &[Candidate], top: usize) -> EngineResult<Vec<usize>> {
    let q = catene::run(sample, CONFRONTO_V1)?.y;
    let mut scored: Vec<(usize, f64)> = pool
        .iter()
        .enumerate()
        .filter_map(|(i, c)| {
            let d = catene::run(&c.spectrum, CONFRONTO_V1).ok()?.y;
            let r = derivative_r(&q, &d);
            r.is_finite().then_some((i, r))
        })
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    Ok(scored.into_iter().take(top).map(|(i, _)| i).collect())
}
