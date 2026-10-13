//! Bridge between the page and the engine. Every function returns JSON text; errors are `{error, error_key, params}`.
//! No `forbid(unsafe_code)` here: the wasm-bindgen glue generatetes unsafe code; this crate holds no logic of its own.

use wasm_bindgen::prelude::*;

mod confronto;

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

/// Opens a file with the reader registry. Returns the document as JSON (`readers::export::to_json`)
/// or `{error, error_key, params}`. The page chooses the budget; the engine never exceeds it.
#[wasm_bindgen]
pub fn open_file(name: &str, bytes: &[u8], max_bytes: u32, max_points: u32) -> String {
    use ftir_core::readers::{self, model::Limits, model::Options};
    let limits = Limits {
        max_bytes: max_bytes as usize,
        max_points: max_points as usize,
        ..Limits::STANDARD
    };
    let head = bytes.get(..bytes.len().min(4096)).unwrap_or_default();
    let Some(reader) = readers::pick(name, head) else {
        return ftir_core::error::EngineError::new("reader.unknown_format", "unknown file format")
            .json();
    };
    match (reader.open)(bytes, &limits, &Options::default()) {
        Ok(doc) => readers::export::to_json(&doc),
        Err(e) => ftir_core::error::EngineError::from(e).json(),
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn open_file_reads_jcamp_and_reports_errors() {
        let jdx = include_bytes!("../../ftir-core/tests/fixtures/jcamp/affn_ascending.jdx");
        let j = super::open_file("a.jdx", jdx, 1 << 20, 1 << 16);
        assert!(j.starts_with("{\"provenance\""), "{j}");
        assert!(j.contains("\"unit\":\"Cm1\""));
        let e = super::open_file("a.jdx", jdx, 16, 1 << 16);
        assert!(e.contains("\"error_key\":\"reader.limit_exceeded\""), "{e}");
        let u = super::open_file("a.bin", b"\x00\x01binary", 1 << 20, 1 << 16);
        assert!(u.contains("\"error_key\":\"reader.unknown_format\""), "{u}");
    }

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
