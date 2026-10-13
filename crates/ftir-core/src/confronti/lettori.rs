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
