//! Bridge between the page and the engine. Every function returns JSON text; errors are `{error, error_key, params}`.
//! No `forbid(unsafe_code)` here: the wasm-bindgen glue generatetes unsafe code; this crate holds no logic of its own.

use wasm_bindgen::prelude::*;

/// Engine version.
#[wasm_bindgen]
pub fn version() -> String {
    ftir_core::VERSION.to_string()
}

/// Synthetic demo spectrum as JSON `{"wavenumber_cm1":[...],"y":[...]}` (deterministic, known truth).
#[wasm_bindgen]
pub fn demo_spectrum() -> String {
    let s = ftir_core::synthetic::generate(&ftir_core::synthetic::Params::demo());
    let list = |v: &[f64]| {
        v.iter()
            .map(|x| format!("{x}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        "{{\"wavenumber_cm1\":[{}],\"y\":[{}]}}",
        list(&s.wavenumber_cm1),
        list(&s.y)
    )
}

#[cfg(test)]
mod test {
    #[test]
    fn version_is_semver() {
        assert_eq!(super::version().split('.').count(), 3);
    }

    #[test]
    fn demo_spectrum_has_matching_axes() {
        let j = super::demo_spectrum();
        assert!(j.starts_with("{\"wavenumber_cm1\":[4000"));
        assert_eq!(j.matches(',').count(), 901 * 2 - 1);
    }
}
