//! `linea_di_base_snip/1`: SNIP baseline (statistics-sensitive non-linear iterative peak clipping), for spectra with
//! many narrow peaks; off by default. As `pybaselines` `snip` with `filter_order=2`, increasing windows, no smoothing and
//! edge padding (`pad_kwargs={"mode": "edge"}`): the data are padded by `max_half_window` points of the edge value and
//! each pass `i = 1..=max_half_window` clips every point to the mean of its neighbours at distance `i`.
//! `max_half_window` is capped at `(N − 1) / 2` of the run. Default 40 points (80 cm⁻¹ on the 2 cm⁻¹ grid).
use super::linea_di_base::{baseline_of, finish, output_mode};
use super::{finite_axis, int, obj, params, Value};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "linea_di_base_snip",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"max_half_window":"integer >= 1","output":"corrected | baseline"}"#,
    defaults: r#"{"max_half_window":40,"output":"corrected"}"#,
    inverse: None,
};

fn snip(y: &[f64], max_half_window: usize) -> Vec<f64> {
    let h = max_half_window.min((y.len() - 1) / 2);
    let total = y.len() + 2 * h;
    let mut base: Vec<f64> = Vec::with_capacity(total);
    base.extend(std::iter::repeat_n(y[0], h));
    base.extend_from_slice(y);
    base.extend(std::iter::repeat_n(y[y.len() - 1], h));
    for i in 1..=h {
        let filters: Vec<f64> = (0..total - 2 * i)
            .map(|j| (base[j] + base[j + 2 * i]) / 2.0)
            .collect();
        for (j, f) in filters.iter().enumerate() {
            if base[i + j] > *f {
                base[i + j] = *f;
            }
        }
    }
    base[h..total - h].to_vec()
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["max_half_window", "output"])?;
    let h = int(&p, "max_half_window", 40)?;
    if h == 0 {
        return Err(super::invalid(
            "max_half_window",
            "expected a whole number of at least 1",
        ));
    }
    let mode = output_mode(&p)?.to_string();
    finite_axis(s)?;
    let base = baseline_of(s, 3, &|y| snip(y, h));
    let used = obj(vec![
        ("max_half_window", Value::Num(h as f64)),
        ("output", Value::Str(mode.clone())),
    ]);
    Ok(finish(s, "linea_di_base_snip/1", &used, &mode, base))
}
