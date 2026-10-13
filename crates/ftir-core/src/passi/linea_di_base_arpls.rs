//! `linea_di_base_arpls/1`: arPLS baseline (Baek 2015), for strongly curved baselines; off by default. Same
//! structure as AsLS without `p`; λ = 1e7 (the AsLS value on the 2 cm⁻¹ grid), 50 iterations, tolerance 1e-3.
use super::linea_di_base::{baseline_of, finish, output_mode};
use super::linea_di_base_asls::{lambda, order, tol};
use super::whittaker;
use super::{finite_axis, int, obj, params, Value};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "linea_di_base_arpls",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"lambda":"number > 0","diff_order":"1, 2 or 3","max_iter":"integer","tol":"number > 0","output":"corrected | baseline"}"#,
    defaults: r#"{"lambda":1e7,"diff_order":2,"max_iter":50,"tol":1e-3,"output":"corrected"}"#,
    inverse: None,
};

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(
        text_params,
        &["lambda", "diff_order", "max_iter", "tol", "output"],
    )?;
    let (lam, d, tol) = (lambda(&p)?, order(&p)?, tol(&p)?);
    let iters = int(&p, "max_iter", 50)?;
    let mode = output_mode(&p)?.to_string();
    finite_axis(s)?;
    let base = baseline_of(s, d + 2, &|y| whittaker::arpls(y, lam, d, iters, tol));
    let used = obj(vec![
        ("lambda", Value::Num(lam)),
        ("diff_order", Value::Num(d as f64)),
        ("max_iter", Value::Num(iters as f64)),
        ("tol", Value::Num(tol)),
        ("output", Value::Str(mode.clone())),
    ]);
    Ok(finish(s, "linea_di_base_arpls/1", &used, &mode, base))
}
