//! Bridge between the page and the engine. Every function returns JSON text; errors are `{error, error_key, params}`.
//! No `forbid(unsafe_code)` here: the wasm-bindgen glue generates unsafe code; this crate holds no logic of its own.

use wasm_bindgen::prelude::*;

/// Engine version.
#[wasm_bindgen]
pub fn versione() -> String {
    ftir_core::VERSIONE.to_string()
}

/// Synthetic demo spectrum as JSON `{"numero_onda_cm1":[...],"y":[...]}` (deterministic, known truth).
#[wasm_bindgen]
pub fn spettro_prova() -> String {
    let s = ftir_core::sintetico::genera(&ftir_core::sintetico::Parametri::prova());
    let lista = |v: &[f64]| {
        v.iter()
            .map(|x| format!("{x}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        "{{\"numero_onda_cm1\":[{}],\"y\":[{}]}}",
        lista(&s.numero_onda_cm1),
        lista(&s.y)
    )
}

#[cfg(test)]
mod test {
    #[test]
    fn version_is_semver() {
        assert_eq!(super::versione().split('.').count(), 3);
    }

    #[test]
    fn demo_spectrum_has_matching_axes() {
        let j = super::spettro_prova();
        assert!(j.starts_with("{\"numero_onda_cm1\":[4000"));
        assert_eq!(j.matches(',').count(), 901 * 2 - 1);
    }
}
