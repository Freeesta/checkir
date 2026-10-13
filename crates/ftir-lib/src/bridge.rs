//! Text-in, text-out entry points for the browser bridge: open a package that was stored or fetched, and build the
//! package of a library imported by the user. The wasm crate only forwards to these functions.
use crate::build::{native_record, resample_jcamp};
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
