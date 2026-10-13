//! Bridge of the manual subtraction: thin functions that return JSON text. The method lives in
//! `ftir_core::passi::sottrazione` and its answers in `sottrazione_json`. Axes in cm-1, `*_unit` = `absorbance` or
//! `transmittance`, NaN = absent point; `params_json` is `{}` or the parameters of the step
//! (`k`, `reference_id`, `library`, `baseline`; `baseline`, `intervals_cm1` for the factor).
use ftir_core::error::EngineError;
use ftir_core::passi::sottrazione_json::{fattore_proposto_json, sottrai_json};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use wasm_bindgen::prelude::*;

fn spectrum(role: Role, unit: &str, x: &[f64], y: &[f64]) -> Result<Spectrum, EngineError> {
    if x.len() != y.len() {
        return Err(EngineError::new(
            "passi.asse_non_valido",
            "axis and values differ in length",
        ));
    }
    let unit = if unit == "transmittance" {
        YUnit::Transmittance
    } else {
        YUnit::Absorbance
    };
    Ok(Spectrum::new(role, unit, x.to_vec(), y.to_vec()))
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn run(
    f: fn(&Spectrum, &Spectrum, &str) -> Result<String, EngineError>,
    sample_unit: &str,
    sample_x: &[f64],
    sample_y: &[f64],
    reference_unit: &str,
    reference_x: &[f64],
    reference_y: &[f64],
    params_json: &str,
) -> String {
    let both = spectrum(Role::Sample, sample_unit, sample_x, sample_y).and_then(|s| {
        spectrum(Role::Reference, reference_unit, reference_x, reference_y).map(|r| (s, r))
    });
    both.and_then(|(s, r)| f(&s, &r, params_json))
        .unwrap_or_else(|e| e.json())
}

/// Suggested factor (least squares with a free straight background, never negative) and the fitted background.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn fattore_proposto(
    sample_unit: &str,
    sample_x: &[f64],
    sample_y: &[f64],
    reference_unit: &str,
    reference_x: &[f64],
    reference_y: &[f64],
    params_json: &str,
) -> String {
    run(
        fattore_proposto_json,
        sample_unit,
        sample_x,
        sample_y,
        reference_unit,
        reference_x,
        reference_y,
        params_json,
    )
}

/// Residual `sample − k × reference` on the overlap, with `k`, `zone_minimum` and the history.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn sottrai(
    sample_unit: &str,
    sample_x: &[f64],
    sample_y: &[f64],
    reference_unit: &str,
    reference_x: &[f64],
    reference_y: &[f64],
    params_json: &str,
) -> String {
    run(
        sottrai_json,
        sample_unit,
        sample_x,
        sample_y,
        reference_unit,
        reference_x,
        reference_y,
        params_json,
    )
}

#[cfg(test)]
mod test;
