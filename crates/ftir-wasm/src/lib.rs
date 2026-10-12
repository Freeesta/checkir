//! Bridge between the page and the engine. Every function returns JSON text; errors are `{error, error_key, params}`.
//! No `forbid(unsafe_code)` here: the wasm-bindgen glue generates unsafe code; this crate holds no logic of its own.

use wasm_bindgen::prelude::*;

/// Engine version.
#[wasm_bindgen]
pub fn version() -> String {
    ftir_core::VERSION.to_string()
}

#[cfg(test)]
mod test {
    #[test]
    fn version_is_semver() {
        assert_eq!(super::version().split('.').count(), 3);
    }
}
