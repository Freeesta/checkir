//! The peaks of one spectrum as the assignment reads them: from a `PeakList` or from `peaks/1` JSON.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};
use crate::peaks::result::{Artifact, IntensityClass, Kind, Peak, PeakList, Shape, Tier};

#[derive(Debug, Clone, PartialEq)]
pub struct PeakSet {
    pub spectrum_id: Option<String>,
    pub noise_abs: f64,
    pub peaks: Vec<Peak>,
}

impl From<&PeakList> for PeakSet {
    fn from(l: &PeakList) -> Self {
        PeakSet {
            spectrum_id: l.spectrum_id.clone(),
            noise_abs: l.noise_abs,
            peaks: l.peaks.clone(),
        }
    }
}

fn bad(field: &str) -> EngineError {
    EngineError::new("assign.picchi_non_validi", "invalid peaks/1 input").with_param("campo", field)
}

fn num(v: &Value, key: &str) -> EngineResult<f64> {
    v.get(key)
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite())
        .ok_or_else(|| bad(key))
}

fn word<'a>(v: &'a Value, key: &str) -> EngineResult<&'a str> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| bad(key))
}

fn shape(v: &Value) -> EngineResult<Option<Shape>> {
    match v.get("shape").and_then(Value::as_str) {
        None => Ok(None),
        Some("narrow") => Ok(Some(Shape::Narrow)),
        Some("medium") => Ok(Some(Shape::Medium)),
        Some("broad") => Ok(Some(Shape::Broad)),
        Some("very_broad") => Ok(Some(Shape::VeryBroad)),
        Some(_) => Err(bad("shape")),
    }
}

/// The class the detection emitted; a list written without it is classed by the embedded cuts.
fn intensity(v: &Value) -> EngineResult<IntensityClass> {
    match v.get("intensity").and_then(Value::as_str) {
        Some(id) => IntensityClass::from_id(id).ok_or_else(|| bad("intensity")),
        None => {
            let t = crate::peaks::Thresholds::embedded()?.tolerances;
            Ok(IntensityClass::of(
                num(v, "prominence_rel")?,
                t.strong_rel_min,
                t.medium_rel_min,
            ))
        }
    }
}

fn peak(v: &Value) -> EngineResult<Peak> {
    let artifact = match v.get("artifact").and_then(Value::as_str) {
        None => None,
        Some("co2") => Some(Artifact::Co2),
        Some("vapour") => Some(Artifact::Vapour),
        Some(_) => return Err(bad("artifact")),
    };
    Ok(Peak {
        id: word(v, "id")?.to_string(),
        position_cm1: num(v, "position_cm1")?,
        height_abs: num(v, "height_abs")?,
        prominence_abs: num(v, "prominence_abs")?,
        prominence_rel: num(v, "prominence_rel")?,
        intensity: intensity(v)?,
        fwhm_cm1: v.get("fwhm_cm1").and_then(Value::as_f64),
        shape: shape(v)?,
        tier: if word(v, "tier")? == "main" {
            Tier::Main
        } else {
            Tier::Secondary
        },
        kind: if word(v, "kind")? == "shoulder" {
            Kind::Shoulder
        } else {
            Kind::Peak
        },
        artifact,
        region_ids: Vec::new(),
    })
}

impl PeakSet {
    /// Reads the fields of `peaks/1` that the assignment needs; the others are ignored.
    pub fn parse(text: &str) -> EngineResult<PeakSet> {
        let v = json::parse(text)?;
        if v.get("schema").and_then(Value::as_str) != Some(crate::peaks::result::SCHEMA) {
            return Err(bad("schema"));
        }
        let list = v
            .get("peaks")
            .and_then(Value::as_arr)
            .ok_or_else(|| bad("peaks"))?;
        Ok(PeakSet {
            spectrum_id: v
                .get("spectrum_id")
                .and_then(Value::as_str)
                .map(str::to_string),
            noise_abs: num(&v, "noise_abs")?,
            peaks: list.iter().map(peak).collect::<EngineResult<_>>()?,
        })
    }
}
