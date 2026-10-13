//! JSON answers of the manual subtraction, for the wasm bridge (the bridge itself holds no logic).
//!
//! `fattore_proposto_json` → `{"k","k_unrounded","points_used","wavenumber_cm1":[...],"background":[...]}`;
//! `sottrai_json` → `{"k","zone_minimum":number|null,"residual":{"role":"residual","wavenumber_cm1":[...],"y":[...],"history":[...]}}`.
//! An absent point is `null`. Errors are the usual `{error, error_key, params}` (`EngineError::json`).
use super::sottrazione::{fattore_proposto, subtract};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

fn number(v: f64) -> String {
    if v.is_finite() {
        format!("{v}")
    } else {
        "null".to_string()
    }
}

fn list(v: &[f64]) -> String {
    v.iter().map(|x| number(*x)).collect::<Vec<_>>().join(",")
}

fn quote(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// Suggested factor and fitted background.
pub fn fattore_proposto_json(
    sample: &Spectrum,
    reference: &Spectrum,
    params: &str,
) -> EngineResult<String> {
    let p = fattore_proposto(sample, reference, params)?;
    Ok(format!(
        "{{\"k\":{},\"k_unrounded\":{},\"points_used\":{},\"wavenumber_cm1\":[{}],\"background\":[{}]}}",
        number(p.k),
        number(p.k_unrounded),
        p.points_used,
        list(&p.wavenumber_cm1),
        list(&p.background)
    ))
}

/// Residual `sample − k × reference`, its history and the minimum in the zones of the reference.
pub fn sottrai_json(sample: &Spectrum, reference: &Spectrum, params: &str) -> EngineResult<String> {
    let r = subtract(sample, reference, params)?;
    let history = r
        .residual
        .history
        .iter()
        .map(|h| quote(h))
        .collect::<Vec<_>>()
        .join(",");
    Ok(format!(
        "{{\"k\":{},\"zone_minimum\":{},\"residual\":{{\"role\":\"residual\",\"wavenumber_cm1\":[{}],\"y\":[{}],\"history\":[{}]}}}}",
        number(r.k),
        r.zone_minimum.map_or_else(|| "null".to_string(), number),
        list(&r.residual.wavenumber_cm1),
        list(&r.residual.y),
        history
    ))
}
