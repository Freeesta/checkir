//! From the files of `data/` to one row of a package: JCAMP-DX read by the engine's reader, converted to absorbance,
//! resampled with the engine's `griglia/1` step (the same code the match chain uses), plus the index row.
use crate::index::Row;
use crate::manifest::Grid;
use ftir_core::error::{EngineError, EngineResult};
use ftir_core::passi::json::parse;
use ftir_core::passi::{griglia, trasmittanza, Value};
use ftir_core::readers::jcamp;
use ftir_core::readers::model::{Limits, Options, XUnit, YUnit};
use ftir_core::readers::sha256::sha256_hex;
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
    pub library_name: String,
    pub library_version: String,
}

fn spectrum_error(id: &str, key: &'static str) -> EngineError {
    EngineError::new(key, "the spectrum cannot enter the library").with_param("id", id)
}

/// Reads a JCAMP-DX file and returns its main spectrum on `grid` in absorbance, `NaN` where it was not measured.
pub fn resample_jcamp(jdx: &[u8], grid: &Grid) -> EngineResult<Vec<f64>> {
    let doc = (jcamp::READER.open)(jdx, &Limits::STANDARD, &Options::default()).map_err(|e| {
        e.params.iter().fold(
            EngineError::new(e.key, "the JCAMP-DX file cannot be read"),
            |err, (k, v)| err.with_param(k, v),
        )
    })?;
    let s = doc
        .spectra
        .get(doc.primary)
        .ok_or_else(|| EngineError::new("library.no_spectrum", "the file has no spectrum"))?;
    if s.x.unit != XUnit::Cm1 {
        return Err(EngineError::new(
            "library.x_unit",
            "the x axis is not in wavenumbers",
        ));
    }
    let (unit, trans_params) = match s.y.unit {
        YUnit::Absorbance => (CoreUnit::Absorbance, None),
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
    let params = format!(
        r#"{{"from_cm1":{},"to_cm1":{},"step_cm1":{}}}"#,
        grid.from_cm1, grid.to_cm1, grid.step_cm1
    );
    Ok(griglia::apply(&spectrum, &params)?.y)
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
    let row = Row {
        id,
        form: member_str(&spec, &["form"]).ok_or_else(|| bad("form"))?,
        substance: member_str(&sub, &["id"]).ok_or_else(|| bad("substance"))?,
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
        library_name: member_str(&spec, &["library", "name"]).ok_or_else(|| bad("library"))?,
        library_version: member_str(&spec, &["library", "version"])
            .ok_or_else(|| bad("library"))?,
    })
}
