//! `trasmittanza_in_assorbanza/1` and its inverse `assorbanza_in_trasmittanza/1`.
//!
//! A = −log10(T) with T a fraction (`percent: true`, the default, divides the file value by 100 first). T ≤ 0 or not
//! finite gives an absent point. A spectrum already in the target unit is returned unchanged, so the step can sit
//! at the head of a chain whatever the file unit is. The inverse maps A to %T (`percent: true`) or to a fraction.
use super::{finite_axis, obj, params, result, Value};
use crate::error::EngineResult;
use crate::spectrum::{Spectrum, YUnit};
use crate::steps::Step;

pub const FORWARD: Step = Step {
    id: "trasmittanza_in_assorbanza",
    version: 1,
    contract: 1,
    apply: to_absorbance,
    params_schema: r#"{"percent":"boolean"}"#,
    defaults: r#"{"percent":true}"#,
    inverse: Some("assorbanza_in_trasmittanza/1"),
};

pub const INVERSE: Step = Step {
    id: "assorbanza_in_trasmittanza",
    version: 1,
    contract: 1,
    apply: to_transmittance,
    params_schema: r#"{"percent":"boolean"}"#,
    defaults: r#"{"percent":true}"#,
    inverse: Some("trasmittanza_in_assorbanza/1"),
};

fn percent(p: &Value) -> EngineResult<bool> {
    match p.get("percent") {
        None => Ok(true),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => Err(super::invalid("percent", "expected true or false")),
    }
}

fn used(percent: bool) -> Value {
    obj(vec![("percent", Value::Bool(percent))])
}

pub fn to_absorbance(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["percent"])?;
    let pc = percent(&p)?;
    finite_axis(s)?;
    if s.y_unit == YUnit::Absorbance {
        return Ok(s.clone());
    }
    let scale = if pc { 100.0 } else { 1.0 };
    let y =
        s.y.iter()
            .map(|t| {
                if t.is_finite() && *t > 0.0 {
                    -(t / scale).log10()
                } else {
                    f64::NAN
                }
            })
            .collect();
    Ok(result(
        s,
        "trasmittanza_in_assorbanza/1",
        &used(pc),
        YUnit::Absorbance,
        s.wavenumber_cm1.clone(),
        y,
    ))
}

pub fn to_transmittance(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["percent"])?;
    let pc = percent(&p)?;
    finite_axis(s)?;
    if s.y_unit == YUnit::Transmittance {
        return Ok(s.clone());
    }
    let scale = if pc { 100.0 } else { 1.0 };
    let y =
        s.y.iter()
            .map(|a| {
                if a.is_finite() {
                    scale * 10f64.powf(-a)
                } else {
                    f64::NAN
                }
            })
            .collect();
    Ok(result(
        s,
        "assorbanza_in_trasmittanza/1",
        &used(pc),
        YUnit::Transmittance,
        s.wavenumber_cm1.clone(),
        y,
    ))
}
