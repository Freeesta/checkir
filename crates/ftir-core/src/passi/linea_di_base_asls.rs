//! `linea_di_base_asls/1`: AsLS baseline (Eilers–Boelens), the default of the service, same values as
//! `pybaselines.Baseline.asls`: λ = 1e7, p = 0.01, 50 iterations, tolerance 1e-3, second order differences (on the 2 cm⁻¹ grid).
//! Returns the corrected spectrum, or the baseline with `"output":"baseline"`.
use super::linea_di_base::{baseline_of, finish, output_mode};
use super::whittaker::{self, MAX_ORDER};
use super::{finite_axis, int, invalid, num, obj, params, Value};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "linea_di_base_asls",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"lambda":"number > 0","p":"number in (0, 1)","diff_order":"1, 2 or 3","max_iter":"integer","tol":"number > 0","output":"corrected | baseline"}"#,
    defaults: r#"{"lambda":1e7,"p":0.01,"diff_order":2,"max_iter":50,"tol":1e-3,"output":"corrected"}"#,
    inverse: None,
};

pub(crate) fn order(p: &Value) -> EngineResult<usize> {
    let d = int(p, "diff_order", 2)?;
    if !(1..=MAX_ORDER).contains(&d) {
        return Err(invalid("diff_order", "expected 1, 2 or 3"));
    }
    Ok(d)
}

pub(crate) fn lambda(p: &Value) -> EngineResult<f64> {
    let l = num(p, "lambda", 1e7)?;
    if !(l.is_finite() && l > 0.0) {
        return Err(invalid("lambda", "expected a positive number"));
    }
    Ok(l)
}

pub(crate) fn tol(p: &Value) -> EngineResult<f64> {
    let t = num(p, "tol", 1e-3)?;
    if !(t.is_finite() && t > 0.0) {
        return Err(invalid("tol", "expected a positive number"));
    }
    Ok(t)
}

/// The baseline vector (absent where a run is too short), without building a spectrum.
pub fn baseline(s: &Spectrum, text_params: &str) -> EngineResult<Vec<f64>> {
    Ok(compute(s, text_params)?.1)
}

fn compute(s: &Spectrum, text_params: &str) -> EngineResult<(Value, Vec<f64>, String)> {
    let p = params(
        text_params,
        &["lambda", "p", "diff_order", "max_iter", "tol", "output"],
    )?;
    let (lam, d, tol) = (lambda(&p)?, order(&p)?, tol(&p)?);
    let pw = num(&p, "p", 0.01)?;
    if !(pw > 0.0 && pw < 1.0) {
        return Err(invalid("p", "expected a number between 0 and 1"));
    }
    let iters = int(&p, "max_iter", 50)?;
    let mode = output_mode(&p)?.to_string();
    finite_axis(s)?;
    let base = baseline_of(s, d + 2, &|y| whittaker::asls(y, lam, pw, d, iters, tol));
    let used = obj(vec![
        ("lambda", Value::Num(lam)),
        ("p", Value::Num(pw)),
        ("diff_order", Value::Num(d as f64)),
        ("max_iter", Value::Num(iters as f64)),
        ("tol", Value::Num(tol)),
        ("output", Value::Str(mode.clone())),
    ]);
    Ok((used, base, mode))
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let (used, base, mode) = compute(s, text_params)?;
    Ok(finish(s, "linea_di_base_asls/1", &used, &mode, base))
}
