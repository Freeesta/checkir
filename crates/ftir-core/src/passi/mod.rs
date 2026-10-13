//! Signal steps (`STEPS` entries): pure functions from a spectrum to a new spectrum, parameters as JSON text.
//!
//! A step never changes its input; the result carries the role of the input and the step in its `history`
//! (`id/version {full parameters}`), so a chain can be replayed from the history alone. A point that cannot be
//! computed or that lies outside the measured range is *absent*: `y` is `NaN` (the axis keeps its length).
use crate::error::{EngineError, EngineResult};
use crate::spectrum::{Spectrum, YUnit};

pub mod catene;
pub mod griglia;
pub mod json;
pub mod maschera;
pub mod normalizza;
pub mod savitzky_golay;
pub mod trasmittanza;

pub use json::Value;

/// Parse step parameters: empty text means `{}`; anything but an object, or a key outside `allowed`, is an error.
pub(crate) fn params(text: &str, allowed: &[&str]) -> EngineResult<Value> {
    let v = if text.trim().is_empty() {
        Value::Obj(Vec::new())
    } else {
        json::parse(text)?
    };
    let Value::Obj(items) = &v else {
        return Err(EngineError::new(
            "passi.parametri_non_oggetto",
            "step parameters must be a JSON object",
        ));
    };
    for (k, _) in items {
        if !allowed.contains(&k.as_str()) {
            return Err(
                EngineError::new("passi.parametro_sconosciuto", "unknown step parameter")
                    .with_param("nome", k),
            );
        }
    }
    Ok(v)
}

pub(crate) fn invalid(name: &'static str, why: &str) -> EngineError {
    EngineError::new("passi.parametro_non_valido", why).with_param("nome", name)
}

/// A number parameter with a default; a value of another type is an error.
pub(crate) fn num(p: &Value, name: &'static str, default: f64) -> EngineResult<f64> {
    match p.get(name) {
        None => Ok(default),
        Some(v) => v.as_f64().ok_or_else(|| invalid(name, "expected a number")),
    }
}

/// A whole number parameter with a default (0 ..= 1e6).
pub(crate) fn int(p: &Value, name: &'static str, default: usize) -> EngineResult<usize> {
    let n = num(p, name, default as f64)?;
    if n.fract() != 0.0 || !(0.0..=1e6).contains(&n) {
        return Err(invalid(
            name,
            "expected a whole number between 0 and 1000000",
        ));
    }
    Ok(n as usize)
}

pub(crate) fn text<'a>(
    p: &'a Value,
    name: &'static str,
    default: &'a str,
) -> EngineResult<&'a str> {
    match p.get(name) {
        None => Ok(default),
        Some(v) => v.as_str().ok_or_else(|| invalid(name, "expected a string")),
    }
}

pub(crate) fn finite_axis(s: &Spectrum) -> EngineResult<()> {
    if s.wavenumber_cm1.len() != s.y.len() || s.wavenumber_cm1.iter().any(|x| !x.is_finite()) {
        return Err(EngineError::new(
            "passi.asse_non_valido",
            "the wavenumber axis is not usable",
        ));
    }
    Ok(())
}

/// The result spectrum: role and history from `src`, plus this step.
pub(crate) fn result(
    src: &Spectrum,
    id: &str,
    used: &Value,
    unit: YUnit,
    x: Vec<f64>,
    y: Vec<f64>,
) -> Spectrum {
    let mut out = Spectrum::new(src.role, unit, x, y);
    out.history = src.history.clone();
    out.history.push(format!("{id} {}", used.write()));
    out
}

/// Value for `{"k":n,...}` from numbers (keeps the order given).
pub(crate) fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Obj(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}
