//! Bridge of the recalled references: factor of the chosen scale and the two correlations, as JSON.
//! `params_json` is `{"scale":"raw"|"max"|"area"|"lsq"}`; the method lives in `ftir_core::richiamo`.
use ftir_core::richiamo::recall_json;
use wasm_bindgen::prelude::*;

/// `{"scale","k","r","r_derivata"}` of a library reference against the sample, or `{error, error_key, params}`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn richiamo(
    sample_unit: &str,
    sample_x: &[f64],
    sample_y: &[f64],
    reference_unit: &str,
    reference_x: &[f64],
    reference_y: &[f64],
    params_json: &str,
) -> String {
    crate::sottrazione::run(
        recall_json,
        sample_unit,
        sample_x,
        sample_y,
        reference_unit,
        reference_x,
        reference_y,
        params_json,
    )
}
