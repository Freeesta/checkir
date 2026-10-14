//! `bands/2`: the group rules, read from JSON. The engine holds no wavenumber; rules are data
//! (`data/bands/rules.json`, embedded here, or a file given by the caller).
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

pub const DEFAULT_JSON: &str = include_str!("../../../../data/bands/rules.json");
pub const SCHEMA: &str = "bands/2";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Intensity {
    Strong,
    Medium,
    Weak,
    Variable,
}

/// How a rule constrains the width of the peak it interprets (sharp rules do not read broad peaks, broad rules do not
/// read narrow ones).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Width {
    Sharp,
    Any,
    Broad,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule {
    pub id: String,
    pub min_cm1: f64,
    pub max_cm1: f64,
    pub group: String,
    pub mode: String,
    pub intensity: Intensity,
    pub width: Width,
    /// Only names the group of a band that a candidate with that group already explains.
    pub candidate_only: bool,
    pub requires_any: Vec<String>,
    pub requires_all: Vec<String>,
    pub excludes: Vec<String>,
    /// Classes (ids of `classes/1`) for which the rule is diagnostic.
    pub diagnostic_for: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuleSet {
    pub version: String,
    pub rules: Vec<Rule>,
}

fn bad(field: &str) -> EngineError {
    EngineError::new("assign.regole_non_valide", "invalid bands/2 file").with_param("campo", field)
}

fn text(v: &Value, key: &str) -> EngineResult<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| bad(key))
}

fn texts(v: &Value, path: &[&str]) -> Vec<String> {
    let mut cur = Some(v);
    for k in path {
        cur = cur.and_then(|c| c.get(k));
    }
    let list = cur.and_then(Value::as_arr).unwrap_or_default();
    list.iter()
        .filter_map(|s| s.as_str().map(str::to_string))
        .collect()
}

fn intensity(v: &Value) -> EngineResult<Intensity> {
    match v.get("intensity").and_then(Value::as_str) {
        Some("strong") => Ok(Intensity::Strong),
        Some("medium") => Ok(Intensity::Medium),
        Some("weak") => Ok(Intensity::Weak),
        Some("variable") => Ok(Intensity::Variable),
        _ => Err(bad("intensity")),
    }
}

fn width(v: &Value) -> EngineResult<Width> {
    match v.get("shape").and_then(Value::as_str) {
        Some("sharp") => Ok(Width::Sharp),
        Some("medium" | "doublet" | "multiplet") => Ok(Width::Any),
        Some("broad" | "very_broad") => Ok(Width::Broad),
        _ => Err(bad("shape")),
    }
}

fn bound(v: &Value, key: &str) -> EngineResult<f64> {
    v.get("range_cm1")
        .and_then(|r| r.get(key))
        .and_then(Value::as_f64)
        .ok_or_else(|| bad("range_cm1"))
}

fn rule(v: &Value) -> EngineResult<Rule> {
    let classes = v.get("diagnostic_for").and_then(Value::as_arr);
    Ok(Rule {
        id: text(v, "id")?,
        min_cm1: bound(v, "min")?,
        max_cm1: bound(v, "max")?,
        group: text(v, "group")?,
        mode: text(v, "mode")?,
        intensity: intensity(v)?,
        width: width(v)?,
        candidate_only: v.get("scope").and_then(Value::as_str) == Some("candidate_only"),
        requires_any: texts(v, &["conditions", "requires_any"]),
        requires_all: texts(v, &["conditions", "requires_all"]),
        excludes: texts(v, &["conditions", "excludes"]),
        diagnostic_for: classes
            .unwrap_or_default()
            .iter()
            .filter_map(|c| c.get("class").and_then(Value::as_str).map(str::to_string))
            .collect(),
        status: text(v, "status")?,
    })
}

impl RuleSet {
    pub fn parse_value(v: &Value) -> EngineResult<RuleSet> {
        if v.get("schema").and_then(Value::as_str) != Some(SCHEMA) {
            return Err(bad("schema"));
        }
        let list = v
            .get("rules")
            .and_then(Value::as_arr)
            .ok_or_else(|| bad("rules"))?;
        Ok(RuleSet {
            version: text(v, "version")?,
            rules: list.iter().map(rule).collect::<EngineResult<_>>()?,
        })
    }

    pub fn parse(text: &str) -> EngineResult<RuleSet> {
        RuleSet::parse_value(&json::parse(text)?)
    }

    pub fn embedded() -> EngineResult<RuleSet> {
        RuleSet::parse(DEFAULT_JSON)
    }

    pub fn get(&self, id: &str) -> Option<&Rule> {
        self.rules.iter().find(|r| r.id == id)
    }
}

impl Rule {
    /// Does the rule's interval, widened by `tol_cm1` on both sides, contain `cm1`?
    pub fn contains(&self, cm1: f64, tol_cm1: f64) -> bool {
        cm1 >= self.min_cm1 - tol_cm1 && cm1 <= self.max_cm1 + tol_cm1
    }

    pub fn width_cm1(&self) -> f64 {
        self.max_cm1 - self.min_cm1
    }
}
