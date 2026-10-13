//! From a reader's spectrum (`readers::model::Spectrum`) to the core `Spectrum` the comparison works on.
//! Only wavenumber axes with absorbance or transmittance are comparable; anything else is a translated error.
use crate::error::{EngineError, EngineResult};
use crate::readers::model::{Role as ReaderRole, Spectrum as FromReader, XUnit, YUnit as ReaderY};
use crate::spectrum::{Role, Spectrum, YUnit};

fn not_comparable(why: &str) -> EngineError {
    EngineError::new("confronti.unita_non_confrontabile", why)
}

/// Convert `s`: a fraction transmittance becomes percent; the axis and values are copied unchanged.
pub fn from_reader(s: &FromReader) -> EngineResult<Spectrum> {
    if s.x.unit != XUnit::Cm1 {
        return Err(not_comparable("the x axis is not in cm-1"));
    }
    let role = match s.role {
        ReaderRole::Reference => Role::Reference,
        ReaderRole::Residual => Role::Residual,
        ReaderRole::Subtraction => Role::Subtraction,
        ReaderRole::Sample | ReaderRole::Processed | ReaderRole::Unknown => Role::Sample,
        _ => {
            return Err(not_comparable(
                "a background or interferogram is not comparable",
            ))
        }
    };
    let (unit, scale) = match s.y.unit {
        ReaderY::Absorbance => (YUnit::Absorbance, 1.0),
        ReaderY::TransmittancePercent => (YUnit::Transmittance, 1.0),
        ReaderY::TransmittanceFraction => (YUnit::Transmittance, 100.0),
        _ => {
            return Err(not_comparable(
                "the y unit is not absorbance or transmittance",
            ))
        }
    };
    let x = s.x.values.to_vec();
    if x.len() != s.y.values.len() {
        return Err(not_comparable("axis and values differ in length"));
    }
    let y = s.y.values.iter().map(|v| v * scale).collect();
    Ok(Spectrum::new(role, unit, x, y))
}

/// The unit a page or caller names (`absorbance`, `transmittance` = `transmittance_percent`, `transmittance_fraction`):
/// the core unit and the factor that brings the values to it (a fraction becomes percent, so `T ≤ 0` stays an absent
/// point in the step that follows). `None` = unknown name.
pub fn unit_named(name: &str) -> Option<(YUnit, f64)> {
    match name {
        "absorbance" => Some((YUnit::Absorbance, 1.0)),
        "transmittance" | "transmittance_percent" => Some((YUnit::Transmittance, 1.0)),
        "transmittance_fraction" => Some((YUnit::Transmittance, 100.0)),
        _ => None,
    }
}

/// A spectrum from the unit name of `unit_named` (an unknown name reads as absorbance, as before); NaN stays NaN.
pub fn spectrum_in(role: Role, unit: &str, x: Vec<f64>, y: Vec<f64>) -> Spectrum {
    let (u, k) = unit_named(unit).unwrap_or((YUnit::Absorbance, 1.0));
    let y = if k == 1.0 {
        y
    } else {
        y.iter().map(|v| v * k).collect()
    };
    Spectrum::new(role, u, x, y)
}
