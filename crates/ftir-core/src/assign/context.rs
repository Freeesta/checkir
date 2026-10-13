//! What the assignment is told besides the peaks: the group rules, the classes of the candidate, the assignments of
//! its bands (`substance-bands/1`) and the diagnostic bands of the common cuts (`tagli/1` with `diagnostic_bands`).
use super::rules::RuleSet;
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

/// Where an assignment of a band comes from; a band from `Dft` never explains a peak by itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Literature,
    Measured,
    Dft,
}

impl Origin {
    pub fn id(self) -> &'static str {
        match self {
            Origin::Literature => "literature",
            Origin::Measured => "measured",
            Origin::Dft => "dft",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SubstanceBand {
    pub position_cm1: f64,
    pub tolerance_cm1: f64,
    pub group: String,
    pub mode: String,
    pub group_instance: Option<String>,
    pub mode_character: Option<String>,
    pub origin: Origin,
    pub status: String,
}

/// The assignments of one form of one substance (`substance-bands/1`).
#[derive(Debug, Clone, PartialEq)]
pub struct SubstanceBands {
    pub substance_id: String,
    pub form: String,
    pub bands: Vec<SubstanceBand>,
}

/// A common cut with the positions that make it recognizable in a mixture.
#[derive(Debug, Clone, PartialEq)]
pub struct Cut {
    pub id: String,
    /// (position, own tolerance if the file gives one).
    pub bands: Vec<(f64, Option<f64>)>,
}

#[derive(Debug, Clone)]
pub struct Context {
    pub rules: Option<RuleSet>,
    pub candidate_classes: Vec<String>,
    pub substance_bands: Vec<SubstanceBands>,
    pub cuts: Vec<Cut>,
}

impl Context {
    /// No rules, no assignments, no cuts: the assignment of `assign` alone.
    pub fn empty() -> Context {
        Context {
            rules: None,
            candidate_classes: Vec::new(),
            substance_bands: Vec::new(),
            cuts: Vec::new(),
        }
    }
}

fn bad(field: &str) -> EngineError {
    EngineError::new("assign.contesto_non_valido", "invalid assignment context")
        .with_param("campo", field)
}

fn num(v: &Value, key: &str) -> EngineResult<f64> {
    v.get(key)
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite())
        .ok_or_else(|| bad(key))
}

fn text(v: &Value, key: &str) -> EngineResult<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| bad(key))
}

fn opt_text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

fn origin(v: &Value) -> EngineResult<Origin> {
    match v.get("origin").and_then(Value::as_str) {
        None | Some("literature") => Ok(Origin::Literature),
        Some("measured") => Ok(Origin::Measured),
        Some("dft") => Ok(Origin::Dft),
        Some(_) => Err(bad("origin")),
    }
}

fn band(v: &Value) -> EngineResult<SubstanceBand> {
    Ok(SubstanceBand {
        position_cm1: num(v, "position_cm1")?,
        tolerance_cm1: num(v, "tolerance_cm1")?,
        group: text(v, "group")?,
        mode: text(v, "mode")?,
        group_instance: opt_text(v, "group_instance"),
        mode_character: opt_text(v, "mode_character"),
        origin: origin(v)?,
        status: text(v, "status")?,
    })
}

fn bands_of(v: &Value) -> EngineResult<SubstanceBands> {
    let list = v
        .get("bands")
        .and_then(Value::as_arr)
        .ok_or_else(|| bad("bands"))?;
    Ok(SubstanceBands {
        substance_id: text(v, "substance")?,
        form: text(v, "form")?,
        bands: list.iter().map(band).collect::<EngineResult<_>>()?,
    })
}

fn cut(v: &Value) -> EngineResult<Cut> {
    let list = v.get("diagnostic_bands").and_then(Value::as_arr);
    let bands = list.unwrap_or_default().iter().map(|b| {
        Ok((
            num(b, "position_cm1")?,
            b.get("tolerance_cm1").and_then(Value::as_f64),
        ))
    });
    Ok(Cut {
        id: text(v, "id")?,
        bands: bands.collect::<EngineResult<_>>()?,
    })
}

fn list_of<T>(v: &Value, key: &str, f: impl Fn(&Value) -> EngineResult<T>) -> EngineResult<Vec<T>> {
    v.get(key)
        .and_then(Value::as_arr)
        .unwrap_or_default()
        .iter()
        .map(f)
        .collect()
}

impl Context {
    /// `{rules?: bands/1, candidate_classes?: [id], substance_bands?: [substance-bands/1], cuts?: tagli/1}`; empty text
    /// = `Context::empty()`. Missing `rules` mean the embedded file is used by the caller.
    pub fn parse(text_json: &str) -> EngineResult<Context> {
        if text_json.trim().is_empty() {
            return Ok(Context::empty());
        }
        let v = json::parse(text_json)?;
        let rules = v.get("rules").map(RuleSet::parse_value).transpose()?;
        let classes = list_of(&v, "candidate_classes", |c| {
            c.as_str()
                .map(str::to_string)
                .ok_or_else(|| bad("candidate_classes"))
        })?;
        let cuts = match v.get("cuts") {
            Some(c) => list_of(c, "cuts", cut)?,
            None => Vec::new(),
        };
        Ok(Context {
            rules,
            candidate_classes: classes,
            substance_bands: list_of(&v, "substance_bands", bands_of)?,
            cuts,
        })
    }
}
