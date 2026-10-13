//! Bridge of the peak index (`peak-index/1`): one index per library, kept in memory (thread-local). Thin functions that
//! return JSON text or bytes; the index itself lives in `ftir_core::peak_index`.
use ftir_core::confronti::lettori::spectrum_in;
use ftir_core::error::EngineError;
use ftir_core::peak_index::{query, PeakIndex};
use ftir_core::peaks::{self, Thresholds};
use ftir_core::spectrum::Role;
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

struct Slot {
    version: String,
    index: PeakIndex,
}

thread_local! {
    static INDEXES: RefCell<HashMap<String, Slot>> = RefCell::new(HashMap::new());
}

fn missing(lib: &str) -> String {
    EngineError::new("peak_index.missing", "no peak index for this library")
        .with_param("library", lib)
        .json()
}

fn thresholds() -> Result<Thresholds, EngineError> {
    Thresholds::embedded()
}

/// Start (or replace) the index of library `lib`; spectra follow with `peak_index_add`, in the order of the library rows.
#[wasm_bindgen]
pub fn peak_index_begin(lib: &str, version: &str) -> String {
    match thresholds() {
        Ok(t) => {
            let index = PeakIndex::new(peaks::CHAIN_ID, t.version);
            INDEXES.with(|m| {
                m.borrow_mut().insert(
                    lib.to_string(),
                    Slot {
                        version: version.to_string(),
                        index,
                    },
                );
            });
            "{\"ok\":true}".into()
        }
        Err(e) => e.json(),
    }
}

/// Add the next spectrum (axis in cm-1, absorbance unless `y_unit` is `transmittance`, NaN = absent point). A spectrum the
/// detection refuses still takes its place and gives no rows (`"usable":false`). Returns `{"ok":true,"rows":n,"usable":b}`.
#[wasm_bindgen]
pub fn peak_index_add(lib: &str, y_unit: &str, wavenumber_cm1: &[f64], y: &[f64]) -> String {
    if wavenumber_cm1.len() != y.len() {
        return EngineError::new(
            "peak_index.spectrum_invalid",
            "axis and values differ in length",
        )
        .json();
    }
    let s = spectrum_in(Role::Reference, y_unit, wavenumber_cm1.to_vec(), y.to_vec());
    let t = match thresholds() {
        Ok(t) => t,
        Err(e) => return e.json(),
    };
    let list = peaks::detect(&s, &t).ok();
    INDEXES.with(|m| match m.borrow_mut().get_mut(lib) {
        Some(slot) => {
            let rows = slot.index.add_spectrum(list.as_ref());
            format!(
                "{{\"ok\":true,\"rows\":{rows},\"usable\":{}}}",
                list.is_some()
            )
        }
        None => missing(lib),
    })
}

/// Sort the rows once all the spectra are in. Returns the header (`peak-index/1`).
#[wasm_bindgen]
pub fn peak_index_finish(lib: &str) -> String {
    INDEXES.with(|m| match m.borrow_mut().get_mut(lib) {
        Some(slot) => {
            slot.index.finish();
            slot.index.header_json(&slot.version)
        }
        None => missing(lib),
    })
}

/// The index as bytes to keep locally; empty when there is none.
#[wasm_bindgen]
pub fn peak_index_export(lib: &str) -> Vec<u8> {
    INDEXES.with(|m| {
        m.borrow()
            .get(lib)
            .map(|s| s.index.to_bytes(&s.version))
            .unwrap_or_default()
    })
}

/// Put a saved index back. An obsolete or damaged cache is an error: the page rebuilds it from the spectra.
#[wasm_bindgen]
pub fn peak_index_import(lib: &str, version: &str, bytes: &[u8]) -> String {
    let t = match thresholds() {
        Ok(t) => t,
        Err(e) => return e.json(),
    };
    match PeakIndex::from_bytes(bytes, peaks::CHAIN_ID, t.version, version) {
        Ok(index) => {
            INDEXES.with(|m| {
                m.borrow_mut().insert(
                    lib.to_string(),
                    Slot {
                        version: version.to_string(),
                        index,
                    },
                );
            });
            "{\"ok\":true}".into()
        }
        Err(e) => e.json(),
    }
}

/// Forget the index of a library.
#[wasm_bindgen]
pub fn peak_index_remove(lib: &str) {
    INDEXES.with(|m| m.borrow_mut().remove(lib));
}

/// Which spectra of library `lib` have a band here? `query_json`: `{peaks:[{position_cm1, tolerance_cm1?}],
/// absent?:[{from_cm1,to_cm1,min_prominence_rel?}], min_found?, limit?}`. Returns `{total, required, hits:[...]}`
/// (spectrum = row of the library) or `{error, error_key, params}`.
#[wasm_bindgen]
pub fn peak_index_query(lib: &str, query_json: &str) -> String {
    let run = || -> Result<String, EngineError> {
        let q = query::parse_query(query_json)?;
        let t = thresholds()?;
        INDEXES.with(|m| match m.borrow().get(lib) {
            Some(slot) => slot.index.query(&q, &t.tolerances).map(|r| r.to_json()),
            None => Err(
                EngineError::new("peak_index.missing", "no peak index for this library")
                    .with_param("library", lib),
            ),
        })
    };
    run().unwrap_or_else(|e| e.json())
}
