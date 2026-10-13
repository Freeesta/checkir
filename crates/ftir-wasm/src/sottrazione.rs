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
fn run(
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
mod test {
    fn band(c: f64, w: f64, h: f64) -> Vec<f64> {
        (0..1576)
            .map(|i| h * (-0.5 * ((650.0 + 2.0 * i as f64 - c) / w).powi(2)).exp())
            .collect()
    }

    fn data() -> (Vec<f64>, Vec<f64>, Vec<f64>) {
        let x: Vec<f64> = (0..1576).map(|i| 650.0 + 2.0 * i as f64).collect();
        let b: Vec<f64> = band(1100.0, 6.0, 0.7)
            .iter()
            .zip(band(2950.0, 10.0, 0.6))
            .map(|(a, c)| a + c)
            .collect();
        let a = band(1700.0, 4.0, 0.15);
        let y = a.iter().zip(&b).map(|(a, b)| a + 0.6 * b).collect();
        (x, y, b)
    }

    #[test]
    fn factor_and_residual_come_back_as_json() {
        let (x, y, b) = data();
        let p = "{\"baseline\":false}";
        let j = super::fattore_proposto("absorbance", &x, &y, "absorbance", &x, &b, p);
        assert!(j.starts_with("{\"k\":0.6"), "{j}");
        assert!(j.contains("\"background\":[") && j.contains("\"points_used\":"));
        let s = super::sottrai(
            "absorbance",
            &x,
            &y,
            "absorbance",
            &x,
            &b,
            "{\"k\":0.6,\"baseline\":false,\"reference_id\":\"B7\",\"library\":\"Lib\"}",
        );
        assert!(s.starts_with("{\"k\":0.6,\"zone_minimum\":"), "{s}");
        assert!(
            s.contains("\"role\":\"residual\"")
                && s.contains("\"sottratto: B7, Lib, k = 0.60\"]}}")
        );
    }

    #[test]
    fn absent_points_are_null_and_errors_are_translatable() {
        let (x, y, b) = data();
        let short: Vec<f64> = x[..1000].to_vec();
        let s = super::sottrai(
            "absorbance",
            &x,
            &y,
            "absorbance",
            &short,
            &b[..1000],
            "{\"baseline\":false}",
        );
        assert!(
            s.contains("null"),
            "outside the reference range the residual is absent"
        );
        let bad = super::sottrai("absorbance", &x, &y[..10], "absorbance", &x, &b, "{}");
        assert!(
            bad.contains("\"error_key\":\"passi.asse_non_valido\""),
            "{bad}"
        );
        let neg = super::sottrai("absorbance", &x, &y, "absorbance", &x, &b, "{\"k\":-1}");
        assert!(
            neg.contains("\"error_key\":\"passi.parametro_non_valido\""),
            "{neg}"
        );
        let flat = vec![0.0; 1576];
        let f = super::fattore_proposto(
            "absorbance",
            &x,
            &y,
            "absorbance",
            &x,
            &flat,
            "{\"baseline\":false}",
        );
        assert!(
            f.contains("\"error_key\":\"passi.fattore_indeterminato\""),
            "{f}"
        );
    }
}
