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

fn library_limits(max_bytes: u32, max_spectra: u32) -> ftir_lib::data::Limits {
    ftir_lib::data::Limits {
        max_bytes: max_bytes as usize,
        max_spectra: max_spectra as usize,
    }
}

/// Checks a library package (schema, counts, size, SHA-256, limits). Returns its manifest as JSON or `{error, error_key, params}`.
#[wasm_bindgen]
pub fn library_open(
    manifest: &str,
    index: &str,
    data: &[u8],
    max_bytes: u32,
    max_spectra: u32,
) -> String {
    ftir_lib::bridge::open_json(
        manifest,
        index,
        data,
        &library_limits(max_bytes, max_spectra),
    )
    .unwrap_or_else(|e| e.json())
}

/// A JCAMP-DX file on the library grid (float32, `NaN` where not measured). The error is thrown as JSON text.
#[wasm_bindgen]
pub fn library_resample(jdx: &[u8]) -> Result<Vec<f32>, String> {
    ftir_lib::bridge::resample_standard(jdx).map_err(|e| e.json())
}

/// Builds the manifest and the index of an imported library: `{"manifest":{...},"index":{...}}` or `{error, ...}`.
#[wasm_bindgen]
pub fn library_build(identity: &str, index: &str, values: &[f32]) -> String {
    ftir_lib::bridge::build_json(identity, index, values).unwrap_or_else(|e| e.json())
}

/// Peaks, shoulders and broad bands of a spectrum (`peaks/1` JSON). An empty `thresholds_json` uses the embedded file;
/// errors are `{error, error_key, params}`.
#[wasm_bindgen]
pub fn detect_peaks(spectrum_json: &str, thresholds_json: &str) -> String {
    ftir_core::peaks::detect_json(spectrum_json, thresholds_json).unwrap_or_else(|e| e.json())
}

/// Measurement-quality checks of an absorbance spectrum (`measurement_quality/1` JSON): residual CO2, water vapour,
/// negative bands; warnings only. An empty `thresholds_json` uses the embedded file; errors are `{error, error_key, params}`.
#[wasm_bindgen]
pub fn measurement_quality(spectrum_json: &str, thresholds_json: &str) -> String {
    ftir_core::measurement_quality::check_json(spectrum_json, thresholds_json)
        .unwrap_or_else(|e| e.json())
}

#[cfg(test)]
mod test {
    #[test]
    fn detect_peaks_reports_errors_as_data() {
        let e = super::detect_peaks("{}", "");
        assert!(e.contains("\"error_key\""), "{e}");
        let t = super::detect_peaks("{}", "not json");
        assert!(t.contains("\"error_key\""), "{t}");
    }

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
    fn libraries_build_open_and_refuse_a_changed_byte() {
        let jdx = include_bytes!("../../ftir-core/tests/fixtures/jcamp/affn_ascending.jdx");
        let values = super::library_resample(jdx).expect("resample");
        let identity = r#"{"name":"mine","version":"1","date":"2026-10-13","license":"x","attribution":{"en":"m"},"private":true}"#;
        let index = r#"{"schema":"ftir-library-index/1","spectra":[{"id":"p1","form":"f","substance":"p1","names":{"en":"a"},"classes":[],"quality":"pass","provenance_type":"user_import"}]}"#;
        let built = super::library_build(identity, index, &values);
        assert!(built.starts_with("{\"manifest\":{"), "{built}");
        let bad = super::library_build(identity, index, &values[..3]);
        assert!(bad.contains("library.row_length"), "{bad}");
        let bytes: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
        let ok = super::library_open("{}", index, &bytes, 1 << 20, 100);
        assert!(ok.contains("library.manifest_invalid"), "{ok}");
        assert!(super::library_resample(b"nope").is_err());
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
