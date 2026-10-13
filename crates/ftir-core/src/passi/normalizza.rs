//! `normalizza/1`: `vettore` (Euclidean norm 1), `snv` (mean 0, sample standard deviation 1), `minmax` (range 0–1).
//! Absent points are ignored and stay absent. A spectrum that is constant or has no points cannot be normalised.
//! For the scores the normalisation lives inside the correlation; this step is for charts and for mixtures.
use super::{invalid, obj, params, result, text, Value};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "normalizza",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"method":"vettore | snv | minmax"}"#,
    defaults: r#"{"method":"minmax"}"#,
    inverse: None,
};

fn flat() -> EngineError {
    EngineError::new(
        "passi.spettro_costante",
        "the spectrum is constant or empty and cannot be normalised",
    )
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["method"])?;
    let method = text(&p, "method", "minmax")?;
    super::finite_axis(s)?;
    let v: Vec<f64> = s.y.iter().copied().filter(|y| y.is_finite()).collect();
    let n = v.len() as f64;
    let (shift, scale) = match method {
        "vettore" => (0.0, v.iter().map(|y| y * y).sum::<f64>().sqrt()),
        "snv" => {
            let mean = v.iter().sum::<f64>() / n;
            (
                mean,
                (v.iter().map(|y| (y - mean).powi(2)).sum::<f64>() / (n - 1.0)).sqrt(),
            )
        }
        "minmax" => {
            let lo = v.iter().copied().fold(f64::INFINITY, f64::min);
            (lo, v.iter().copied().fold(f64::NEG_INFINITY, f64::max) - lo)
        }
        _ => return Err(invalid("method", "expected vettore, snv or minmax")),
    };
    if v.len() < 2 || !scale.is_finite() || scale <= 0.0 {
        return Err(flat());
    }
    let y = s.y.iter().map(|y| (y - shift) / scale).collect();
    let used = obj(vec![("method", Value::Str(method.to_string()))]);
    Ok(result(
        s,
        "normalizza/1",
        &used,
        s.y_unit,
        s.wavenumber_cm1.clone(),
        y,
    ))
}
