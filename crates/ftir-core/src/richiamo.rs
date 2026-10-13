//! Recalled references: the numbers shown beside a library spectrum the chemist looks at next to the sample.
//!
//! Both spectra go through the same preparation as the comparison (`confronti::prepare`: grid 650–3800 cm⁻¹ step 2,
//! mask 1900–2400), so `r_derivata` is the r of the candidate row (`pearson_derivata/1`) and `r` the one of
//! `pearson_spettro/1` (spectra after AsLS). Nothing else is computed in the page.
//!
//! Scale: the factor `k` that multiplies the reference, worked out on the absorbance of both on that grid, outside the mask,
//! at the points where both are finite and without baseline correction: `raw` = 1 (as measured), `max` = highest value of the
//! sample over that of the reference, `area` = ratio of the trapezoid areas, `lsq` = least squares through the origin
//! (`Σ s·r / Σ r²`, never below 0). Any `k` that is not finite and positive becomes 1. It is a display scale, not the
//! subtraction factor (`passi::sottrazione::fattore_proposto`, which also fits a straight background).
use crate::confronti::{grid_absorbance, masked, pearson, prepare};
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{parse, Value};
use crate::spectrum::Spectrum;

/// The four display scales, in the order the page offers them.
pub const SCALES: [&str; 4] = ["raw", "max", "area", "lsq"];

/// Result of `recall`: the scale used, its factor and the two correlations (`None` = too few points or a flat vector).
#[derive(Debug, Clone, PartialEq)]
pub struct Recall {
    pub scale: String,
    pub k: f64,
    pub r: Option<f64>,
    pub r_derivata: Option<f64>,
}

fn area(v: &[(f64, f64)]) -> f64 {
    v.windows(2)
        .map(|w| (w[1].0 - w[0].0).abs() * (w[1].1 + w[0].1) / 2.0)
        .sum()
}

/// Scale factor on `(x, sample, reference)` triples; 1 when it cannot be worked out.
fn factor(scale: &str, p: &[(f64, f64, f64)]) -> f64 {
    let top = |f: fn(&(f64, f64, f64)) -> f64| p.iter().map(f).fold(0.0, f64::max);
    let curve = |f: fn(&(f64, f64, f64)) -> f64| p.iter().map(|t| (t.0, f(t))).collect::<Vec<_>>();
    let k = match scale {
        "max" => top(|t| t.1) / top(|t| t.2),
        "area" => area(&curve(|t| t.1)) / area(&curve(|t| t.2)),
        "lsq" => {
            let den: f64 = p.iter().map(|t| t.2 * t.2).sum();
            let num: f64 = p.iter().map(|t| t.1 * t.2).sum();
            if den > 0.0 {
                (num / den).max(0.0)
            } else {
                1.0
            }
        }
        _ => 1.0,
    };
    if k.is_finite() && k > 0.0 {
        k
    } else {
        1.0
    }
}

/// Factor and correlations of `reference` against `sample` for the given scale (`raw`, `max`, `area`, `lsq`).
pub fn recall(sample: &Spectrum, reference: &Spectrum, scale: &str) -> EngineResult<Recall> {
    if !SCALES.contains(&scale) {
        return Err(EngineError::new(
            "richiamo.scala_sconosciuta",
            "unknown scale",
        ));
    }
    let (s, r) = (grid_absorbance(sample), grid_absorbance(reference));
    let (Some(s), Some(r)) = (s, r) else {
        return Err(EngineError::new(
            "richiamo.spettro_non_utilizzabile",
            "no usable absorbance on the comparison grid",
        ));
    };
    let pairs: Vec<(f64, f64, f64)> = (0..s.y.len().min(r.y.len()))
        .filter(|&i| !masked(i) && s.y[i].is_finite() && r.y[i].is_finite())
        .map(|i| (s.wavenumber_cm1[i], s.y[i], r.y[i]))
        .collect();
    let (ps, pr) = (prepare(sample)?, prepare(reference)?);
    Ok(Recall {
        scale: scale.to_string(),
        k: factor(scale, &pairs),
        r: pearson::pearson(&ps.spec, &pr.spec, None),
        r_derivata: pearson::pearson(&ps.deriv, &pr.deriv, None),
    })
}

fn number(v: Option<f64>) -> String {
    v.map_or("null".to_string(), |x| format!("{x}"))
}

/// `recall` as JSON `{"scale","k","r","r_derivata"}` (`r*` null when not defined).
pub fn recall_json(sample: &Spectrum, reference: &Spectrum, params: &str) -> EngineResult<String> {
    let scale = match parse(params).ok().as_ref().and_then(|p| p.get("scale")) {
        Some(Value::Str(s)) => s.clone(),
        _ => "raw".to_string(),
    };
    let r = recall(sample, reference, &scale)?;
    Ok(format!(
        "{{\"scale\":\"{}\",\"k\":{},\"r\":{},\"r_derivata\":{}}}",
        r.scale,
        r.k,
        number(r.r),
        number(r.r_derivata)
    ))
}
