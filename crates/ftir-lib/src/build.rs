//! From the files of `data/` to one row of a package: JCAMP-DX read by the engine's reader, converted to absorbance,
//! resampled with the engine's `griglia/1` step (the same code the match chain uses), plus the index row.
use crate::index::Row;
use crate::manifest::Grid;
use ftir_core::error::{EngineError, EngineResult};
use ftir_core::passi::json::parse;
use ftir_core::passi::{griglia, trasmittanza, Value};
use ftir_core::readers::model::{Limits, Options, XUnit, YUnit};
use ftir_core::readers::sha256::sha256_hex;
use ftir_core::readers::{self, jcamp};
use ftir_core::spectrum::{Role, Spectrum, YUnit as CoreUnit};

/// The three files of one spectrum of `data/`: the substance, the spectrum metadata and the JCAMP-DX.
#[derive(Debug, Clone, Copy)]
pub struct Source<'a> {
    pub substance_json: &'a str,
    pub spectrum_json: &'a str,
    pub jdx: &'a [u8],
}

/// One built row and the library the spectrum declares to belong to.
#[derive(Debug, Clone, PartialEq)]
pub struct Built {
    pub row: Row,
    pub values: Vec<f32>,
    /// The record of `native_record`, kept next to the resampled values.
    pub native: Vec<f32>,
    pub library_name: String,
    pub library_version: String,
    /// Sampling method the spectrum record declares (`technique`); `None` = not said or not enough to name it.
    pub sampling: Option<&'static str>,
}

fn spectrum_error(id: &str, key: &'static str) -> EngineError {
    EngineError::new(key, "the spectrum cannot enter the library").with_param("id", id)
}

/// Reads a file with `reader` and returns its main spectrum in absorbance (only the unit is converted) and the nominal
/// resolution the file states, if any.
fn read_absorbance(
    reader: &readers::Reader,
    bytes: &[u8],
) -> EngineResult<(Spectrum, Option<f64>)> {
    let doc = (reader.open)(bytes, &Limits::STANDARD, &Options::default()).map_err(|e| {
        e.params.iter().fold(
            EngineError::new(e.key, "the file cannot be read"),
            |err, (k, v)| err.with_param(k, v),
        )
    })?;
    let s = doc
        .spectra
        .get(doc.primary)
        .ok_or_else(|| EngineError::new("library.no_spectrum", "the file has no spectrum"))?;
    absorbance_of(s, false)
}

/// One spectrum of a document in absorbance (only the unit is converted) and its stated nominal resolution. With
/// `shape_only` an arbitrary y unit is taken as absorbance (the shape counts, the scale is lost: a normalised library).
fn absorbance_of(
    s: &readers::model::Spectrum,
    shape_only: bool,
) -> EngineResult<(Spectrum, Option<f64>)> {
    if s.x.unit != XUnit::Cm1 {
        return Err(EngineError::new(
            "library.x_unit",
            "the x axis is not in wavenumbers",
        ));
    }
    let (unit, trans_params) = match s.y.unit {
        YUnit::Absorbance => (CoreUnit::Absorbance, None),
        YUnit::Arbitrary if shape_only => (CoreUnit::Absorbance, None),
        YUnit::TransmittancePercent => (CoreUnit::Transmittance, Some(r#"{"percent":true}"#)),
        YUnit::TransmittanceFraction => (CoreUnit::Transmittance, Some(r#"{"percent":false}"#)),
        other => {
            return Err(
                EngineError::new("library.y_unit", "the y axis is not absorbance")
                    .with_param("unit", format!("{other:?}")),
            )
        }
    };
    let mut spectrum = Spectrum::new(
        Role::Reference,
        unit,
        s.x.values.to_vec(),
        s.y.values.clone(),
    );
    if let Some(p) = trans_params {
        spectrum = trasmittanza::to_absorbance(&spectrum, p)?;
    }
    let resolution = s.instrument.resolution_cm1.as_ref().map(|r| r.value);
    Ok((spectrum, resolution))
}

/// Reads a JCAMP-DX file and returns its main spectrum on `grid` in absorbance, `NaN` where it was not measured.
pub fn resample_jcamp(jdx: &[u8], grid: &Grid) -> EngineResult<Vec<f64>> {
    resample_with(&jcamp::READER, jdx, grid)
}

/// Like `resample_jcamp` for any file a reader of the registry recognises (`reader.unknown_format` otherwise).
pub fn resample_file(name: &str, bytes: &[u8], grid: &Grid) -> EngineResult<Vec<f64>> {
    resample_with(reader_of(name, bytes)?, bytes, grid)
}

/// The reader of the registry that recognises the file.
fn reader_of(name: &str, bytes: &[u8]) -> EngineResult<&'static readers::Reader> {
    let head = bytes.get(..bytes.len().min(4096)).unwrap_or_default();
    readers::pick(name, head)
        .ok_or_else(|| EngineError::new("reader.unknown_format", "unknown file format"))
}

fn resample_with(reader: &readers::Reader, bytes: &[u8], grid: &Grid) -> EngineResult<Vec<f64>> {
    let (spectrum, _) = read_absorbance(reader, bytes)?;
    let params = format!(
        r#"{{"from_cm1":{},"to_cm1":{},"step_cm1":{}}}"#,
        grid.from_cm1, grid.to_cm1, grid.step_cm1
    );
    Ok(griglia::apply(&spectrum, &params)?.y)
}

/// The spectrum exactly as the file gives it, for drawing: one float32 record `[points, resolution_cm1 (NaN when the
/// file does not state it), x…, y…]` in the order of the file, absorbance (a transmittance file is only converted).
/// The resampled vectors serve the calculation and are never drawn as "the reference".
pub fn native_record(jdx: &[u8]) -> EngineResult<Vec<f32>> {
    native_with(&jcamp::READER, jdx)
}

/// Like `native_record` for any file a reader of the registry recognises.
pub fn native_record_file(name: &str, bytes: &[u8]) -> EngineResult<Vec<f32>> {
    native_with(reader_of(name, bytes)?, bytes)
}

fn native_with(reader: &readers::Reader, bytes: &[u8]) -> EngineResult<Vec<f32>> {
    let (s, resolution) = read_absorbance(reader, bytes)?;
    let mut out = Vec::with_capacity(2 + 2 * s.y.len());
    out.push(s.y.len() as f32);
    out.push(resolution.map_or(f32::NAN, |r| r as f32));
    out.extend(s.wavenumber_cm1.iter().map(|v| *v as f32));
    out.extend(s.y.iter().map(|v| *v as f32));
    Ok(out)
}

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_arr)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn member<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(v, |acc, k| acc.get(k))
}

fn member_str(v: &Value, path: &[&str]) -> Option<String> {
    member(v, path).and_then(Value::as_str).map(str::to_string)
}

/// Sampling id of the `technique` of a spectrum record. Only an ATR with a named crystal gives one: the record does
/// not say what a transmission measurement was made on.
fn sampling_of(spectrum: &Value) -> Option<&'static str> {
    let part = |k: &str| member_str(spectrum, &["technique", k]).unwrap_or_default();
    let (method, crystal) = (part("method"), part("crystal"));
    match (method.as_str(), crystal.as_str()) {
        ("ATR", "diamond") => Some("atr_diamond"),
        ("ATR", "Ge") => Some("atr_ge"),
        ("ATR", "ZnSe") => Some("atr_znse"),
        _ => None,
    }
}

/// `pass` unless some quality check is not a pass.
fn worst_quality(spectrum: &Value) -> &'static str {
    let checks = member(spectrum, &["quality", "checks"]).and_then(Value::as_arr);
    let all_pass = checks.is_some_and(|c| {
        c.iter()
            .all(|x| x.get("result").and_then(Value::as_str) == Some("pass"))
    });
    if all_pass {
        "pass"
    } else {
        "warning"
    }
}

/// Builds the row and the values of one spectrum. Refuses a spectrum whose JCAMP does not match its recorded SHA-256
/// and a provenance that must never be public (`unconfirmed_sample`).
pub fn build_one(src: &Source, grid: &Grid) -> EngineResult<Built> {
    let bad = |field: &str| {
        EngineError::new("library.source_invalid", "a source file is incomplete")
            .with_param("field", field)
    };
    let sub = parse(src.substance_json).map_err(|_| bad("substance.json"))?;
    let spec = parse(src.spectrum_json).map_err(|_| bad("spectrum.json"))?;
    let id = member_str(&spec, &["id"]).ok_or_else(|| bad("id"))?;
    if member_str(&spec, &["sha256"]).as_deref() != Some(sha256_hex(src.jdx).as_str()) {
        return Err(spectrum_error(&id, "library.spectrum_sha256"));
    }
    let provenance = member_str(&spec, &["provenance", "type"]).ok_or_else(|| bad("provenance"))?;
    if provenance == "unconfirmed_sample" {
        return Err(spectrum_error(&id, "library.provenance_not_allowed"));
    }
    let mut classes = Vec::new();
    for axis in ["chemical", "effect", "typical_role"] {
        classes.extend(strings(member(&sub, &["classes", axis])));
    }
    let values = resample_jcamp(src.jdx, grid)?
        .into_iter()
        .map(|v| v as f32)
        .collect();
    let native = native_record(src.jdx)?;
    let row = Row {
        id,
        form: member_str(&spec, &["form"]).ok_or_else(|| bad("form"))?,
        substance: Some(member_str(&sub, &["id"]).ok_or_else(|| bad("substance"))?),
        name_it: member_str(&sub, &["names", "it", "preferred"]),
        name_en: member_str(&sub, &["names", "en", "preferred"]).ok_or_else(|| bad("names"))?,
        classes,
        inchikey: member_str(&sub, &["inchikey"]),
        quality: worst_quality(&spec).to_string(),
        provenance_type: provenance,
    };
    Ok(Built {
        row,
        values,
        native,
        library_name: member_str(&spec, &["library", "name"]).ok_or_else(|| bad("library"))?,
        library_version: member_str(&spec, &["library", "version"])
            .ok_or_else(|| bad("library"))?,
        sampling: sampling_of(&spec),
    })
}

/// The entries of a Shimadzu IRsolution library (`.L01` with its `.nam`): name, resampled values and native record of each.
#[derive(Debug, Clone, PartialEq)]
pub struct ShimadzuEntries {
    pub names: Vec<String>,
    /// The entries one after the other on `grid`, float32.
    pub values: Vec<f32>,
    /// The records of `native_record`, one after the other.
    pub native: Vec<f32>,
    /// Warnings of the reader as `(key, params)`, e.g. `reader.scale_lost`.
    pub warnings: Vec<(String, Vec<(String, String)>)>,
}

/// Reads a Shimadzu library; the names come from `nam` when given (an empty one for an entry without a name).
pub fn shimadzu_entries(
    l01: &[u8],
    nam: Option<&[u8]>,
    max_bytes: usize,
    grid: &Grid,
) -> EngineResult<ShimadzuEntries> {
    let limits = Limits {
        max_bytes,
        max_spectra: 50_000,
        ..Limits::STANDARD
    };
    let doc = readers::shimadzu_lib::open_named(l01, nam, &limits).map_err(|e| {
        e.params.iter().fold(
            EngineError::new(e.key, "the file cannot be read"),
            |err, (k, v)| err.with_param(k, v),
        )
    })?;
    let params = format!(
        r#"{{"from_cm1":{},"to_cm1":{},"step_cm1":{}}}"#,
        grid.from_cm1, grid.to_cm1, grid.step_cm1
    );
    let mut out = ShimadzuEntries {
        names: Vec::new(),
        values: Vec::new(),
        native: Vec::new(),
        warnings: doc
            .warnings
            .iter()
            .map(|w| {
                let p = w.params.iter().map(|(k, v)| (k.to_string(), v.clone()));
                (w.key.to_string(), p.collect())
            })
            .collect(),
    };
    for s in &doc.spectra {
        let (spectrum, resolution) = absorbance_of(s, true)?;
        out.values.extend(
            griglia::apply(&spectrum, &params)?
                .y
                .iter()
                .map(|v| *v as f32),
        );
        out.native.push(spectrum.y.len() as f32);
        out.native.push(resolution.map_or(f32::NAN, |r| r as f32));
        out.native
            .extend(spectrum.wavenumber_cm1.iter().map(|v| *v as f32));
        out.native.extend(spectrum.y.iter().map(|v| *v as f32));
        out.names.push(
            s.measurement
                .title
                .as_ref()
                .map_or(String::new(), |t| t.value.clone()),
        );
    }
    Ok(out)
}
