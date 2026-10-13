//! Text-in, text-out entry points for the browser bridge: open a package that was stored or fetched, and build the
//! package of a library imported by the user. The wasm crate only forwards to these functions.
use crate::build::{
    native_record, native_record_file, resample_file, resample_jcamp, shimadzu_entries,
    ShimadzuEntries,
};
use crate::data::Limits;
use crate::index::parse_index;
use crate::invalid;
use crate::manifest::Grid;
use crate::package::{write_package, Identity, Package};
use ftir_core::error::EngineResult;
use ftir_core::passi::json::parse;
use ftir_core::passi::Value;

const KEY: &str = "library.identity_invalid";

/// Opens and checks a package; returns its manifest as JSON text. The caller keeps the bytes it passed in.
pub fn open_json(
    manifest_json: &str,
    index_json: &str,
    data_bin: &[u8],
    limits: &Limits,
) -> EngineResult<String> {
    Ok(Package::open(manifest_json, index_json, data_bin, limits)?
        .manifest
        .to_json())
}

/// A JCAMP-DX file on the standard grid as float32 (`NaN` where it was not measured).
pub fn resample_standard(jdx: &[u8]) -> EngineResult<Vec<f32>> {
    Ok(resample_jcamp(jdx, &Grid::STANDARD)?
        .into_iter()
        .map(|v| v as f32)
        .collect())
}

/// A JCAMP-DX file as the file gives it (`build::native_record`), for drawing the reference.
pub fn native_standard(jdx: &[u8]) -> EngineResult<Vec<f32>> {
    native_record(jdx)
}

/// Any file the readers recognise, main spectrum on the standard grid as float32.
pub fn resample_standard_file(name: &str, bytes: &[u8]) -> EngineResult<Vec<f32>> {
    Ok(resample_file(name, bytes, &Grid::STANDARD)?
        .into_iter()
        .map(|v| v as f32)
        .collect())
}

/// Any file the readers recognise as the file gives it (`build::native_record_file`).
pub fn native_standard_file(name: &str, bytes: &[u8]) -> EngineResult<Vec<f32>> {
    native_record_file(name, bytes)
}

/// A Shimadzu library on the standard grid: `(entries, names and warnings as JSON)`. The page splits the entries by
/// the count in the JSON.
pub fn shimadzu_standard(
    l01: &[u8],
    nam: Option<&[u8]>,
    max_bytes: usize,
) -> EngineResult<ShimadzuEntries> {
    shimadzu_entries(l01, nam, max_bytes, &Grid::STANDARD)
}

/// The names and warnings of a `ShimadzuEntries` as JSON: `{"names":[...],"warnings":[{"key":..,"params":{..}}]}`.
pub fn shimadzu_meta_json(e: &ShimadzuEntries) -> String {
    let q = |s: &str| {
        let mut o = String::from("\"");
        for c in s.chars() {
            match c {
                '"' => o.push_str("\\\""),
                '\\' => o.push_str("\\\\"),
                c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
                c => o.push(c),
            }
        }
        o.push('"');
        o
    };
    let names: Vec<String> = e.names.iter().map(|n| q(n)).collect();
    let warnings: Vec<String> = e
        .warnings
        .iter()
        .map(|(k, ps)| {
            let p: Vec<String> = ps
                .iter()
                .map(|(a, b)| format!("{}:{}", q(a), q(b)))
                .collect();
            format!("{{\"key\":{},\"params\":{{{}}}}}", q(k), p.join(","))
        })
        .collect();
    format!(
        "{{\"names\":[{}],\"warnings\":[{}]}}",
        names.join(","),
        warnings.join(",")
    )
}

fn identity(source: &str) -> EngineResult<Identity> {
    let v = parse(source).map_err(|_| invalid(KEY, "json"))?;
    let req = |name: &str| {
        crate::text(&v, name)
            .map(str::to_string)
            .ok_or_else(|| invalid(KEY, name))
    };
    let attribution = v
        .get("attribution")
        .ok_or_else(|| invalid(KEY, "attribution"))?;
    Ok(Identity {
        name: req("name")?,
        version: req("version")?,
        date: req("date")?,
        license: req("license")?,
        attribution_it: crate::text(attribution, "it").map(str::to_string),
        attribution_en: crate::text(attribution, "en")
            .ok_or_else(|| invalid(KEY, "attribution"))?
            .to_string(),
        terms_it: None,
        terms_en: None,
        private: matches!(v.get("private"), Some(Value::Bool(true))),
        sampling: crate::sampling(&v, KEY)?,
    })
}

/// Builds a package from an identity (JSON), an index (JSON, rows in order) and the values of all spectra one after
/// the other on the standard grid. Returns `{"manifest": {...}, "index": {...}}`; `data.bin` is the values as
/// little-endian float32, which the caller already holds.
pub fn build_json(identity_json: &str, index_json: &str, values: &[f32]) -> EngineResult<String> {
    let identity = identity(identity_json)?;
    let rows = parse_index(index_json)?;
    let points = Grid::STANDARD.points()?;
    if values.len() != rows.len() * points {
        return Err(invalid("library.row_length", "values")
            .with_param("row", rows.len().to_string())
            .with_param("found", values.len().to_string())
            .with_param("expected", (rows.len() * points).to_string()));
    }
    let with_values = rows
        .into_iter()
        .zip(values.chunks(points))
        .map(|(row, v)| (row, v.to_vec()))
        .collect();
    let files = write_package(&identity, &Grid::STANDARD, with_values)?;
    Ok(format!(
        "{{\"manifest\":{},\"index\":{}}}",
        files.manifest_json, files.index_json
    ))
}
