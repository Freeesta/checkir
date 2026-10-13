//! `griglia/1`: resample on a uniform ascending grid with linear interpolation (as `numpy.interp`), never extrapolating.
//!
//! Points of the grid outside the measured range, or between two points one of which is absent, are absent (`NaN`).
//! The input axis may be ascending or descending. Defaults: 650–3800 cm⁻¹, step 2 cm⁻¹ (1576 points).
use super::{finite_axis, invalid, num, obj, params, result, Value};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "griglia",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"from_cm1":"number","to_cm1":"number","step_cm1":"number > 0"}"#,
    defaults: r#"{"from_cm1":650,"to_cm1":3800,"step_cm1":2}"#,
    inverse: None,
};

const MAX_POINTS: f64 = 1e6;

/// Linear interpolation of ascending `(xs, ys)` at `x`; `None` outside the range or next to an absent point.
fn interp(xs: &[f64], ys: &[f64], x: f64) -> Option<f64> {
    let (first, last) = (*xs.first()?, *xs.last()?);
    if x < first || x > last {
        return None;
    }
    let j = xs.partition_point(|v| *v <= x);
    if j == xs.len() {
        return ys.last().copied().filter(|v| v.is_finite());
    }
    let (x0, x1, y0, y1) = (xs[j - 1], xs[j], ys[j - 1], ys[j]);
    if x == x0 {
        return Some(y0).filter(|v| v.is_finite());
    }
    let v = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    v.is_finite().then_some(v)
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["from_cm1", "to_cm1", "step_cm1"])?;
    let (from, to, step) = (
        num(&p, "from_cm1", 650.0)?,
        num(&p, "to_cm1", 3800.0)?,
        num(&p, "step_cm1", 2.0)?,
    );
    if !(step.is_finite() && step > 0.0 && from.is_finite() && to.is_finite() && to >= from) {
        return Err(invalid(
            "step_cm1",
            "expected from_cm1 <= to_cm1 and step_cm1 > 0",
        ));
    }
    let n = ((to - from) / step + 1e-9).floor() + 1.0;
    if n > MAX_POINTS {
        return Err(
            EngineError::new("passi.troppi_punti", "the grid has too many points")
                .with_param("punti", n),
        );
    }
    finite_axis(s)?;
    let mut pairs: Vec<(f64, f64)> = s
        .wavenumber_cm1
        .iter()
        .copied()
        .zip(s.y.iter().copied())
        .collect();
    pairs.sort_by(|a, b| a.0.total_cmp(&b.0));
    if pairs.windows(2).any(|w| w[0].0 == w[1].0) {
        return Err(EngineError::new(
            "passi.asse_non_valido",
            "the wavenumber axis has repeated values",
        ));
    }
    let (xs, ys): (Vec<f64>, Vec<f64>) = pairs.into_iter().unzip();
    let x: Vec<f64> = (0..n as usize).map(|i| from + step * i as f64).collect();
    let y = x
        .iter()
        .map(|v| interp(&xs, &ys, *v).unwrap_or(f64::NAN))
        .collect();
    let used = obj(vec![
        ("from_cm1", Value::Num(from)),
        ("to_cm1", Value::Num(to)),
        ("step_cm1", Value::Num(step)),
    ]);
    Ok(result(s, "griglia/1", &used, s.y_unit, x, y))
}
