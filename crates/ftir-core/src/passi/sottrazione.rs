//! `sottrazione/1`: residual = sample − k × reference, and `fattore_proposto`, the suggested k. Not in `STEPS`
//! (the registry holds one-input steps; this one takes two spectra).
//!
//! Both spectra are first brought to absorbance, resampled on the default grid (`griglia/1`) and, unless
//! `"baseline":false`, corrected with `linea_di_base_asls/1`; everything is computed on the overlap only (outside = absent).
//! The residual is a new spectrum with role `Residual` and the history of the prepared sample plus
//! `sottratto: <reference id>, <library>, k = 0.84`; the sample is never changed.
//!
//! `fattore_proposto` fits `sample ≈ k·reference + a + b·x` by least squares (x = wavenumber scaled to [−1, 1] over the
//! grid) outside the masks, with `k ≥ 0` (if the fit gives k < 0, k = 0 and `a, b` are fitted alone), and rounds k to
//! 0.01. The fitted background is returned apart for the chart and is NOT subtracted from the residual: it only stops
//! a sloping background from distorting k (on the bench: cut found 91 % against 60 % without it, in absorbance).
use super::savitzky_golay::solve;
use super::{griglia, invalid, linea_di_base_asls, maschera, num, params, trasmittanza, Value};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::{Role, Spectrum, YUnit};

pub const ID: &str = "sottrazione/1";
const GRID_FROM: f64 = 650.0;
const GRID_TO: f64 = 3800.0;
/// Zones of the residual checked for over-subtraction: where the reference exceeds this fraction of its maximum.
const ZONE_FRACTION: f64 = 0.10;

/// Result of a subtraction.
#[derive(Debug, Clone)]
pub struct Subtraction {
    pub residual: Spectrum,
    pub k: f64,
    /// Minimum of the residual where the reference exceeds 10 % of its maximum (for the over-subtraction warning).
    pub zone_minimum: Option<f64>,
}

/// Suggested factor and the background fitted with it.
#[derive(Debug, Clone)]
pub struct Proposal {
    /// Least-squares factor rounded to 0.01 (never negative).
    pub k: f64,
    pub k_unrounded: f64,
    /// Fitted background `a + b·x` on the whole grid (not subtracted from the residual).
    pub background: Vec<f64>,
    pub wavenumber_cm1: Vec<f64>,
    pub points_used: usize,
}

fn flag(p: &Value, name: &'static str, default: bool) -> EngineResult<bool> {
    match p.get(name) {
        None => Ok(default),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => Err(invalid(name, "expected true or false")),
    }
}

/// Absorbance on the default grid, with the baseline removed when asked.
fn prepare(s: &Spectrum, baseline: bool) -> EngineResult<Spectrum> {
    let a = trasmittanza::to_absorbance(s, "{}")?;
    let g = griglia::apply(&a, "{}")?;
    if baseline {
        linea_di_base_asls::apply(&g, "{}")
    } else {
        Ok(g)
    }
}

fn both(
    sample: &Spectrum,
    reference: &Spectrum,
    baseline: bool,
) -> EngineResult<(Spectrum, Spectrum)> {
    Ok((prepare(sample, baseline)?, prepare(reference, baseline)?))
}

pub fn subtract(
    sample: &Spectrum,
    reference: &Spectrum,
    text_params: &str,
) -> EngineResult<Subtraction> {
    let p = params(text_params, &["k", "reference_id", "library", "baseline"])?;
    let k = num(&p, "k", 1.0)?;
    if !(k.is_finite() && k >= 0.0) {
        return Err(invalid("k", "expected a number of at least 0"));
    }
    let label = |name: &'static str| super::text(&p, name, "").map(str::to_string);
    let (rid, lib) = (label("reference_id")?, label("library")?);
    let (c, r) = both(sample, reference, flag(&p, "baseline", true)?)?;
    let y: Vec<f64> = c.y.iter().zip(&r.y).map(|(c, r)| c - k * r).collect();
    let top =
        r.y.iter()
            .zip(&c.y)
            .filter(|(r, c)| r.is_finite() && c.is_finite())
            .fold(f64::NEG_INFINITY, |m, (r, _)| m.max(*r));
    let zone_minimum = y
        .iter()
        .zip(&r.y)
        .filter(|(y, r)| y.is_finite() && **r > ZONE_FRACTION * top)
        .map(|(y, _)| *y)
        .fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.min(v))));
    let parts: Vec<&str> = [rid.as_str(), lib.as_str()]
        .into_iter()
        .filter(|t| !t.is_empty())
        .collect();
    let mut residual = Spectrum::new(
        Role::Residual,
        YUnit::Absorbance,
        c.wavenumber_cm1.clone(),
        y,
    );
    residual.history = c.history.clone();
    residual.history.push(format!(
        "sottratto: {}k = {k:.2}",
        parts.iter().map(|t| format!("{t}, ")).collect::<String>()
    ));
    Ok(Subtraction {
        residual,
        k,
        zone_minimum,
    })
}

fn fit(rows: &[(f64, f64, f64)], with_k: bool) -> Option<Vec<f64>> {
    let design = |r: &(f64, f64, f64)| {
        if with_k {
            vec![r.0, 1.0, r.1]
        } else {
            vec![1.0, r.1]
        }
    };
    let m = if with_k { 3 } else { 2 };
    let mut a = vec![vec![0.0; m]; m];
    let mut b = vec![0.0; m];
    for row in rows {
        let d = design(row);
        for i in 0..m {
            b[i] += d[i] * row.2;
            for j in 0..m {
                a[i][j] += d[i] * d[j];
            }
        }
    }
    let x = solve(a, b);
    x.iter().all(|v| v.is_finite()).then_some(x)
}

pub fn fattore_proposto(
    sample: &Spectrum,
    reference: &Spectrum,
    text_params: &str,
) -> EngineResult<Proposal> {
    let p = params(text_params, &["baseline", "intervals_cm1"])?;
    let masks = maschera::intervals(&p)?;
    let (c, r) = both(sample, reference, flag(&p, "baseline", true)?)?;
    let scale = |x: f64| 2.0 * (x - GRID_FROM) / (GRID_TO - GRID_FROM) - 1.0;
    let rows: Vec<(f64, f64, f64)> = (0..c.len())
        .filter(|i| c.y[*i].is_finite() && r.y[*i].is_finite())
        .filter(|i| {
            !masks
                .iter()
                .any(|(lo, hi)| c.wavenumber_cm1[*i] >= *lo && c.wavenumber_cm1[*i] <= *hi)
        })
        .map(|i| (r.y[i], scale(c.wavenumber_cm1[i]), c.y[i]))
        .collect();
    let undetermined = || {
        EngineError::new(
            "passi.fattore_indeterminato",
            "the factor cannot be determined from the overlap",
        )
    };
    if rows.len() < 3 {
        return Err(undetermined());
    }
    let full = fit(&rows, true).ok_or_else(undetermined)?;
    let (k, a, b) = if full[0] >= 0.0 {
        (full[0], full[1], full[2])
    } else {
        let ab = fit(&rows, false).ok_or_else(undetermined)?;
        (0.0, ab[0], ab[1])
    };
    let background = c.wavenumber_cm1.iter().map(|x| a + b * scale(*x)).collect();
    let rounded = (k * 100.0).round() / 100.0;
    Ok(Proposal {
        k: rounded + 0.0,
        k_unrounded: k,
        background,
        wavenumber_cm1: c.wavenumber_cm1,
        points_used: rows.len(),
    })
}
