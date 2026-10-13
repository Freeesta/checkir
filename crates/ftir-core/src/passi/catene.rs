//! `catene/1`: a chain of steps as data (`{"schema","id","steps":[{"id":"name/version","params":{...}}]}`), saved with
//! every result so the same calculation can be repeated. `confronto_v1` is the chain of the library comparison:
//! absorbance → grid → Savitzky–Golay first derivative → mask (the mask comes after the derivative so the edges of the
//! excluded zones do not make steps). The baseline is not part of it: it serves the chart and the side score.
use super::{json, Value};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;
use crate::steps::find;

pub const SCHEMA: &str = "catene/1";

pub const CONFRONTO_V1: &str = r#"{"schema":"catene/1","id":"confronto_v1","steps":[
{"id":"trasmittanza_in_assorbanza/1","params":{"percent":true}},
{"id":"griglia/1","params":{"from_cm1":650,"to_cm1":3800,"step_cm1":2}},
{"id":"savitzky_golay/1","params":{"window":15,"polyorder":3,"deriv":1}},
{"id":"maschera/1","params":{"intervals_cm1":[[1900,2400]]}}]}"#;

/// Apply the chain to `s`; the result history lists every step that changed the data. Errors name the failing step.
pub fn run(s: &Spectrum, chain: &str) -> EngineResult<Spectrum> {
    let doc = json::parse(chain)?;
    if doc.get("schema").and_then(Value::as_str) != Some(SCHEMA) {
        return Err(EngineError::new(
            "passi.catena_non_valida",
            "the chain schema is not catene/1",
        ));
    }
    let list = doc
        .get("steps")
        .and_then(Value::as_arr)
        .ok_or_else(|| EngineError::new("passi.catena_non_valida", "the chain has no steps"))?;
    let mut cur = s.clone();
    for item in list {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        let step = find(id).ok_or_else(|| {
            EngineError::new("passi.passo_sconosciuto", "unknown step").with_param("passo", id)
        })?;
        let params = item.get("params").map(Value::write).unwrap_or_default();
        cur = (step.apply)(&cur, &params).map_err(|e| e.with_param("passo", id))?;
    }
    Ok(cur)
}
