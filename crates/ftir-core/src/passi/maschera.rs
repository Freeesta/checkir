//! `maschera/1`: intervals excluded from the comparison (their points become absent; the axis is kept so the chart can
//! still show them). Intervals are `[low, high]` in cm⁻¹, ends included. Default: 1900–2400 (diamond and CO₂).
use super::{invalid, obj, params, result, Value};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "maschera",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"intervals_cm1":"array of [low, high] pairs, low <= high"}"#,
    defaults: r#"{"intervals_cm1":[[1900,2400]]}"#,
    inverse: None,
};

pub(crate) fn intervals(p: &Value) -> EngineResult<Vec<(f64, f64)>> {
    let Some(list) = p.get("intervals_cm1") else {
        return Ok(vec![(1900.0, 2400.0)]);
    };
    let bad = || {
        invalid(
            "intervals_cm1",
            "expected a list of [low, high] pairs with low <= high",
        )
    };
    let mut out = Vec::new();
    for item in list.as_arr().ok_or_else(bad)? {
        match item.as_arr().ok_or_else(bad)? {
            [lo, hi] => match (lo.as_f64(), hi.as_f64()) {
                (Some(lo), Some(hi)) if lo <= hi => out.push((lo, hi)),
                _ => return Err(bad()),
            },
            _ => return Err(bad()),
        }
    }
    Ok(out)
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["intervals_cm1"])?;
    let ranges = intervals(&p)?;
    super::finite_axis(s)?;
    let y = s
        .wavenumber_cm1
        .iter()
        .zip(&s.y)
        .map(|(x, y)| {
            if ranges.iter().any(|(lo, hi)| x >= lo && x <= hi) {
                f64::NAN
            } else {
                *y
            }
        })
        .collect();
    let list = ranges
        .iter()
        .map(|(lo, hi)| Value::Arr(vec![Value::Num(*lo), Value::Num(*hi)]))
        .collect();
    let used = obj(vec![("intervals_cm1", Value::Arr(list))]);
    Ok(result(
        s,
        "maschera/1",
        &used,
        s.y_unit,
        s.wavenumber_cm1.clone(),
        y,
    ))
}
