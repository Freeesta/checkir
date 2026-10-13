//! JSON of a mixture analysis and of an iterative subtraction, and the entry points that take JSON (for the bridge).
//!
//! Input: `{"sample": <spectrum>, "candidates": [{"id", "substance"?, "name", "library", <spectrum>}]}` where a spectrum
//! is `{"wavenumber_cm1":[…], "y":[…], "y_unit"?}` (`null` = absent point). Output schema names:
//! `ftir-risultato-miscele/1` and `ftir-risultato-sottrazione/1`. Numbers that are not finite are written as `null`.
use super::iterativa::{self, Iteration};
use super::{
    Alert, BandsCheck, Candidate, Component, Cuts, Mixture, Status, Thresholds, UnexplainedPeak,
};
use crate::confronti::opzioni::parse_query;
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};
use crate::peaks;
use crate::spectrum::Spectrum;

pub const MIXTURE_SCHEMA: &str = "ftir-risultato-miscele/1";
pub const SUBTRACTION_SCHEMA: &str = "ftir-risultato-sottrazione/1";
/// Fixed texts the page shows with every result (keys translated by the page).
const NOTES: [&str; 3] = [
    "contribution_not_quantity",
    "cut_limit_other_instruments",
    "instrument_differences",
];

fn num(x: f64) -> Value {
    if x.is_finite() {
        Value::Num(x)
    } else {
        Value::Null
    }
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Obj(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn list(v: &[f64]) -> Value {
    Value::Arr(v.iter().map(|x| num(*x)).collect())
}

fn alerts_of(alerts: &[Alert]) -> Value {
    Value::Arr(
        alerts
            .iter()
            .map(|a| {
                let data = a.data.iter().map(|(k, v)| (k.clone(), num(*v))).collect();
                obj(vec![("id", text(a.id)), ("data", Value::Obj(data))])
            })
            .collect(),
    )
}

fn peaks_of(peaks: &[UnexplainedPeak]) -> Value {
    Value::Arr(
        peaks
            .iter()
            .map(|p| {
                obj(vec![
                    ("position_cm1", num(p.position_cm1)),
                    ("height_abs", num(p.height_abs)),
                    ("prominence_abs", num(p.prominence_abs)),
                    (
                        "region_ids",
                        Value::Arr(p.region_ids.iter().map(|r| text(r)).collect()),
                    ),
                ])
            })
            .collect(),
    )
}

fn bands_of(b: &Option<BandsCheck>) -> Value {
    b.as_ref().map_or(Value::Null, |b| {
        obj(vec![
            ("unexplained_before", num(b.unexplained_before as f64)),
            ("explained", num(b.explained as f64)),
            ("passed", Value::Bool(b.passed)),
        ])
    })
}

impl Mixture {
    pub fn to_value(&self) -> Value {
        mixture_value(self)
    }
}

impl Iteration {
    pub fn to_value(&self) -> Value {
        iteration_value(self)
    }
}

fn component_value(c: &Component) -> Value {
    obj(vec![
        ("id", text(&c.id)),
        ("name", text(&c.name)),
        (
            "substance",
            c.substance.as_deref().map_or(Value::Null, text),
        ),
        ("library", text(&c.library)),
        ("is_cut", Value::Bool(c.is_cut)),
        ("weight", num(c.weight)),
        ("contribution", num(c.contribution)),
        ("variance_gain_share", num(c.gain)),
        ("needed_variance_share", num(c.needed)),
        (
            "variant_of",
            c.variant_of.as_deref().map_or(Value::Null, text),
        ),
        ("bands_criterion", bands_of(&c.bands)),
        (
            "status",
            text(match c.status {
                Status::Proposed => "proposed",
                Status::PossibleNotShown => "possible_not_shown",
            }),
        ),
    ])
}

fn mixture_value(v: &Mixture) -> Value {
    let components = v.components.iter().map(component_value);
    obj(vec![
        ("schema", text(MIXTURE_SCHEMA)),
        ("thresholds_version", num(f64::from(v.thresholds_version))),
        ("cuts_version", num(f64::from(v.cuts_version))),
        (
            "peaks_thresholds_version",
            num(f64::from(v.peaks_thresholds_version)),
        ),
        ("candidates_used", num(v.candidates_used as f64)),
        ("components", Value::Arr(components.collect())),
        ("unexplained_variance_share", num(v.unexplained_share)),
        ("wavenumber_cm1", list(&v.residual.wavenumber_cm1)),
        ("residual_y", list(&v.residual.y)),
        ("background_y", list(&v.background)),
        (
            "history",
            Value::Arr(v.residual.history.iter().map(|h| text(h)).collect()),
        ),
        ("unexplained_peaks", peaks_of(&v.unexplained_peaks)),
        ("alerts", alerts_of(&v.alerts)),
        ("notes", Value::Arr(NOTES.iter().map(|n| text(n)).collect())),
    ])
}

fn iteration_value(v: &Iteration) -> Value {
    let rounds = v.rounds.iter().map(|r| {
        obj(vec![
            ("id", text(&r.id)),
            ("name", text(&r.name)),
            ("library", text(&r.library)),
            ("k", num(r.k)),
            ("variance_gain_share", num(r.gain)),
            ("zone_minimum", r.zone_minimum.map_or(Value::Null, num)),
            ("over_subtraction", Value::Bool(r.over_subtraction)),
        ])
    });
    obj(vec![
        ("schema", text(SUBTRACTION_SCHEMA)),
        ("thresholds_version", num(f64::from(v.thresholds_version))),
        ("rounds", Value::Arr(rounds.collect())),
        ("unexplained_variance_share", num(v.unexplained_share)),
        ("wavenumber_cm1", list(&v.residual.wavenumber_cm1)),
        ("residual_y", list(&v.residual.y)),
        (
            "history",
            Value::Arr(v.residual.history.iter().map(|h| text(h)).collect()),
        ),
        ("unexplained_peaks", peaks_of(&v.unexplained_peaks)),
        ("alerts", alerts_of(&v.alerts)),
        ("notes", Value::Arr(NOTES.iter().map(|n| text(n)).collect())),
    ])
}

fn bad_input(why: &str) -> EngineError {
    EngineError::new("miscele.input_non_valido", why)
}

fn string_of(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

/// The sample and the pool from the JSON input.
pub fn parse_input(text_json: &str) -> EngineResult<(Spectrum, Vec<Candidate>)> {
    let v = json::parse(text_json)?;
    let sample = parse_query(
        &v.get("sample")
            .ok_or_else(|| bad_input("no sample"))?
            .write(),
    )?;
    let items = v
        .get("candidates")
        .and_then(Value::as_arr)
        .ok_or_else(|| bad_input("no candidates"))?;
    let mut pool = Vec::new();
    for item in items {
        let id = string_of(item, "id").ok_or_else(|| bad_input("a candidate has no id"))?;
        let name = string_of(item, "name").unwrap_or_else(|| id.clone());
        pool.push(Candidate {
            substance: string_of(item, "substance"),
            library: string_of(item, "library").unwrap_or_default(),
            spectrum: parse_query(&item.write())?,
            name,
            id,
        });
    }
    Ok((sample, pool))
}

fn thresholds(text_json: &str) -> EngineResult<Thresholds> {
    if text_json.trim().is_empty() {
        Thresholds::embedded()
    } else {
        Thresholds::parse(text_json)
    }
}

/// `analyze` on JSON input; empty `thresholds_json` / `cuts_json` mean the embedded files.
pub fn analyze_json(input: &str, thresholds_json: &str, cuts_json: &str) -> EngineResult<String> {
    let (sample, pool) = parse_input(input)?;
    let cuts = if cuts_json.trim().is_empty() {
        Cuts::embedded()?
    } else {
        Cuts::parse(cuts_json)?
    };
    let m = super::analyze(
        &sample,
        &pool,
        &thresholds(thresholds_json)?,
        &cuts,
        &peaks::Thresholds::embedded()?,
    )?;
    Ok(m.to_value().write())
}

/// `iterativa::run` on JSON input (same shape).
pub fn subtract_json(input: &str, thresholds_json: &str) -> EngineResult<String> {
    let (sample, pool) = parse_input(input)?;
    let r = iterativa::run(
        &sample,
        &pool,
        &thresholds(thresholds_json)?,
        &peaks::Thresholds::embedded()?,
    )?;
    Ok(r.to_value().write())
}
