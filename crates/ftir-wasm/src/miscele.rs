//! Bridge of the mixture analysis: thin functions that return JSON text. The method lives in `ftir_core::miscele`.
//! Input `{"sample":{wavenumber_cm1,y},"candidates":[{id,substance?,name,library,wavenumber_cm1,y}]}`;
//! empty `thresholds_json` / `cuts_json` mean the files embedded in the build.
use ftir_core::miscele::risultato;
use wasm_bindgen::prelude::*;

/// Forward selection with background: components, contributions, residual and alerts.
#[wasm_bindgen]
pub fn miscele_analizza(input_json: &str, thresholds_json: &str, cuts_json: &str) -> String {
    risultato::analyze_json(input_json, thresholds_json, cuts_json).unwrap_or_else(|e| e.json())
}

/// Automatic iterative subtraction (up to 3 rounds) with the over-subtraction warning.
#[wasm_bindgen]
pub fn miscele_sottrai(input_json: &str, thresholds_json: &str) -> String {
    risultato::subtract_json(input_json, thresholds_json).unwrap_or_else(|e| e.json())
}
