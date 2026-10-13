//! Bridge of the library comparison: one engine per page (thread-local), thin functions that return JSON text.
//! The comparison itself, the caches and the twins live in `ftir_core::confronti`.
use ftir_core::confronti::libreria::LibEntry;
use ftir_core::confronti::motore::Motore;
use ftir_core::error::EngineError;
use ftir_core::readers::model::Limits;
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

thread_local! {
    static MOTORE: RefCell<Motore> = RefCell::new(Motore::new());
}

const OK: &str = "{\"ok\":true}";

fn with<T>(f: impl FnOnce(&mut Motore) -> T) -> T {
    MOTORE.with(|m| f(&mut m.borrow_mut()))
}

fn answer(r: Result<(), EngineError>) -> String {
    r.map_or_else(|e| e.json(), |()| OK.to_string())
}

fn entry(id: &str, substance: &str, display_name: &str, form: &str) -> LibEntry {
    LibEntry {
        id: id.to_string(),
        substance: (!substance.is_empty()).then(|| substance.to_string()),
        display_name: display_name.to_string(),
        form: form.to_string(),
    }
}

/// Start (or replace) the library `id`; spectra follow with `confronto_libreria_aggiungi*`.
#[wasm_bindgen]
pub fn confronto_libreria_inizia(id: &str, version: &str) {
    with(|m| m.begin(id, version));
}

/// Add one spectrum (axis in cm-1, `y_unit` = `absorbance` or `transmittance`, NaN = absent point).
/// An empty `substance` means "no identity: group by name". Returns `{"ok":true}` or `{error, error_key, params}`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn confronto_libreria_aggiungi(
    lib: &str,
    id: &str,
    substance: &str,
    display_name: &str,
    form: &str,
    y_unit: &str,
    wavenumber_cm1: &[f64],
    y: &[f64],
) -> String {
    if wavenumber_cm1.len() != y.len() {
        return EngineError::new(
            "confronti.spettro_non_valido",
            "axis and values differ in length",
        )
        .json();
    }
    let unit = if y_unit == "transmittance" {
        YUnit::Transmittance
    } else {
        YUnit::Absorbance
    };
    let s = Spectrum::new(Role::Reference, unit, wavenumber_cm1.to_vec(), y.to_vec());
    answer(with(|m| {
        m.add(lib, entry(id, substance, display_name, form), &s)
    }))
}

/// Add the main spectrum of a library file (JCAMP-DX, text) read by the reader registry.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn confronto_libreria_aggiungi_file(
    lib: &str,
    id: &str,
    substance: &str,
    display_name: &str,
    form: &str,
    file_name: &str,
    bytes: &[u8],
    max_bytes: u32,
    max_points: u32,
) -> String {
    let limits = Limits {
        max_bytes: max_bytes as usize,
        max_points: max_points as usize,
        ..Limits::STANDARD
    };
    answer(with(|m| {
        m.add_file(
            lib,
            entry(id, substance, display_name, form),
            file_name,
            bytes,
            &limits,
        )
    }))
}

/// The prepared library as bytes to keep locally; empty when the library is not loaded.
#[wasm_bindgen]
pub fn confronto_libreria_esporta(id: &str) -> Vec<u8> {
    with(|m| m.export(id)).unwrap_or_default()
}

/// Put a saved library back. An obsolete or damaged cache is an error: the page rebuilds it from the spectra.
#[wasm_bindgen]
pub fn confronto_libreria_importa(bytes: &[u8]) -> String {
    answer(with(|m| m.import(bytes)))
}

#[wasm_bindgen]
pub fn confronto_libreria_togli(id: &str) {
    with(|m| m.remove(id));
}

/// Loaded libraries as JSON `[{"id","version","spectra"}]`.
#[wasm_bindgen]
pub fn confronto_stato() -> String {
    with(|m| m.status())
}

/// Next block of spectral twins: `{"done":n,"total":m}`; the page calls it until `done == total`.
#[wasm_bindgen]
pub fn confronto_gemelli_blocco() -> String {
    let (done, total) = with(|m| m.twins_step());
    format!("{{\"done\":{done},\"total\":{total}}}")
}

#[wasm_bindgen]
pub fn confronto_gemelli_esporta() -> Vec<u8> {
    with(|m| m.twins_export())
}

/// Resume saved twins: `{"ok":true,"resumed":bool}` (false = they belong to other libraries).
#[wasm_bindgen]
pub fn confronto_gemelli_importa(bytes: &[u8]) -> String {
    match with(|m| m.twins_import(bytes)) {
        Ok(resumed) => format!("{{\"ok\":true,\"resumed\":{resumed}}}"),
        Err(e) => e.json(),
    }
}

/// Start the library test over the libraries `ids_json` (a JSON array of ids) or carry on with the one begun for the
/// same libraries: `{"done":n,"total":m}`.
#[wasm_bindgen]
pub fn confronto_prova_inizia(ids_json: &str) -> String {
    let ids: Vec<String> = match ftir_core::passi::json::parse(ids_json) {
        Ok(v) => v
            .as_arr()
            .unwrap_or_default()
            .iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect(),
        Err(e) => return e.json(),
    };
    progress(with(|m| m.prova_start(&ids)))
}

/// Next block of the library test: `{"done":n,"total":m}`; the page calls it until `done == total` (or stops).
#[wasm_bindgen]
pub fn confronto_prova_blocco() -> String {
    progress(with(|m| m.prova_step()))
}

/// JSON `prova-libreria/1` of the test so far.
#[wasm_bindgen]
pub fn confronto_prova_rapporto() -> String {
    with(|m| m.prova_report()).unwrap_or_else(|e| e.json())
}

/// CSV of the test so far (ids and names only), or the error JSON.
#[wasm_bindgen]
pub fn confronto_prova_csv() -> String {
    with(|m| m.prova_csv()).unwrap_or_else(|e| e.json())
}

fn progress(r: Result<(usize, usize), EngineError>) -> String {
    r.map_or_else(
        |e| e.json(),
        |(done, total)| format!("{{\"done\":{done},\"total\":{total}}}"),
    )
}

/// `confronta(spettro, opzioni) → risultato`: the query as JSON `{role, y_unit, wavenumber_cm1, y}`, the options as
/// JSON (`ranges`, `range_preset`, `libraries`, `origin`); the result is `ftir-risultato-confronto/1` or an error.
#[wasm_bindgen]
pub fn confronta(spettro: &str, opzioni: &str) -> String {
    with(|m| m.compare(spettro, opzioni)).unwrap_or_else(|e| e.json())
}

#[cfg(test)]
mod test {
    use super::*;

    fn wave(phase: f64) -> (Vec<f64>, Vec<f64>) {
        let x: Vec<f64> = (0..1700).map(|i| 4000.0 - 2.0 * f64::from(i)).collect();
        let y = x
            .iter()
            .map(|v| {
                0.1 + (v * 0.01 + phase).sin().abs() + 0.5 / (1.0 + ((v - 1500.0) / 20.0).powi(2))
            })
            .collect();
        (x, y)
    }

    #[test]
    fn a_library_is_loaded_exported_searched_and_the_twins_finish() {
        confronto_libreria_inizia("demo", "1");
        for (k, phase) in [0.0, 0.7, 1.4].into_iter().enumerate() {
            let (x, y) = wave(phase);
            let r = confronto_libreria_aggiungi(
                "demo",
                &format!("s{k}"),
                &format!("sub{k}"),
                &format!("Sub {k}"),
                "base",
                "absorbance",
                &x,
                &y,
            );
            assert_eq!(r, OK, "{r}");
        }
        assert_eq!(
            confronto_stato(),
            "[{\"id\":\"demo\",\"version\":\"1\",\"spectra\":3}]"
        );
        let saved = confronto_libreria_esporta("demo");
        assert!(!saved.is_empty());
        confronto_libreria_togli("demo");
        assert_eq!(confronto_stato(), "[]");
        assert_eq!(confronto_libreria_importa(&saved), OK);
        assert_eq!(confronto_gemelli_blocco(), "{\"done\":3,\"total\":3}");
        let (x, y) = wave(0.7);
        let q = format!("{{\"wavenumber_cm1\":{x:?},\"y\":{y:?}}}");
        let res = confronta(&q, "");
        assert!(
            res.starts_with("{\"schema\":\"ftir-risultato-confronto/1\""),
            "{res}"
        );
        assert!(res.contains("\"spectrum_id\":\"s1\""));
        let e = confronta("{}", "");
        assert!(e.contains("\"error_key\""), "{e}");
        assert!(confronto_libreria_importa(b"junk").contains("confronti.cache_non_valida"));
        assert_eq!(
            confronto_prova_inizia("[\"demo\"]"),
            "{\"done\":0,\"total\":3}"
        );
        assert_eq!(confronto_prova_blocco(), "{\"done\":3,\"total\":3}");
        assert!(confronto_prova_rapporto().contains("\"schema\":\"prova-libreria/1\""));
        assert!(confronto_prova_csv().starts_with("kind,r,"));
        assert!(confronto_prova_inizia("[\"nope\"]").contains("confronti.libreria_sconosciuta"));
    }
}
