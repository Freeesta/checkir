//! `measurement_quality/1` (schema in `docs/schemi/measurement_quality-1.json`): problems of the measurement that can be
//! seen in the absorbance spectrum of any format: residual CO₂, water vapour lines, negative bands. They are warnings,
//! never blocks: the result says what was checked, what was measured, the limit, and a catalogue key for the text.
//! The outcome is neutral («no anomalous signal found» / «attention»); it is never a pass mark. The limits are data
//! (`quality_thresholds/1`). The comparison has its own `quality_*` alerts, relative to the noise
//! (`confronti/controlli.rs`); these are absolute limits in absorbance and do not change the comparison.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::Value;
use crate::spectrum::{Spectrum, YUnit};

mod controls;
pub mod thresholds;

pub use thresholds::Thresholds;

pub const SCHEMA: &str = "measurement_quality/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    NoSignal,
    Attention,
    /// The needed range is not in the spectrum, so the check could not be done.
    NotEvaluable,
}

impl Outcome {
    pub fn id(self) -> &'static str {
        match self {
            Outcome::NoSignal => "no_signal",
            Outcome::Attention => "attention",
            Outcome::NotEvaluable => "not_evaluable",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Check {
    pub id: &'static str,
    pub outcome: Outcome,
    /// `Some("strong")` for a negative band below the strong limit.
    pub severity: Option<&'static str>,
    pub measured: Option<f64>,
    pub threshold: f64,
    pub unit: &'static str,
    pub at_cm1: Option<f64>,
}

impl Check {
    /// Catalogue key of the text: `quality.<check>.<outcome>`; the advice for the lab is `quality.<check>.action`.
    pub fn message_key(&self) -> String {
        format!("quality.{}.{}", self.id, self.outcome.id())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Report {
    pub thresholds_version: u32,
    pub checks: Vec<Check>,
}

impl Report {
    pub fn has_attention(&self) -> bool {
        self.checks.iter().any(|c| c.outcome == Outcome::Attention)
    }

    pub fn to_json(&self) -> String {
        let num = |x: f64| Value::Num(x);
        let s = |x: &str| Value::Str(x.to_string());
        let opt = |x: Option<f64>| x.map_or(Value::Null, Value::Num);
        let checks = self.checks.iter().map(|c| {
            let mut f = vec![
                ("id".to_string(), s(c.id)),
                ("outcome".to_string(), s(c.outcome.id())),
                ("severity".to_string(), c.severity.map_or(Value::Null, s)),
                ("value".to_string(), opt(c.measured)),
                ("threshold".to_string(), num(c.threshold)),
                ("unit".to_string(), s(c.unit)),
                ("at_cm1".to_string(), opt(c.at_cm1)),
                ("message_key".to_string(), Value::Str(c.message_key())),
            ];
            if c.outcome == Outcome::Attention {
                f.push((
                    "action_key".to_string(),
                    Value::Str(format!("quality.{}.action", c.id)),
                ));
            }
            Value::Obj(f)
        });
        let summary = if self.has_attention() {
            "quality.summary.attention"
        } else {
            "quality.summary.no_signal"
        };
        Value::Obj(vec![
            ("schema".to_string(), s(SCHEMA)),
            (
                "thresholds".to_string(),
                Value::Obj(vec![(
                    "version".to_string(),
                    num(f64::from(self.thresholds_version)),
                )]),
            ),
            ("blocks".to_string(), Value::Bool(false)),
            ("summary_key".to_string(), s(summary)),
            ("checks".to_string(), Value::Arr(checks.collect())),
        ])
        .write()
    }
}

/// Runs the checks on an absorbance spectrum. A transmittance spectrum is an error (convert it first).
pub fn check(s: &Spectrum, t: &Thresholds) -> EngineResult<Report> {
    if s.y_unit != YUnit::Absorbance {
        return Err(EngineError::new(
            "quality.needs_absorbance",
            "the spectrum must be in absorbance",
        ));
    }
    Ok(Report {
        thresholds_version: t.version,
        checks: controls::run(s, t),
    })
}

/// `check` on a spectrum given as JSON `{wavenumber_cm1, y, y_unit?}`, thresholds as JSON (empty = embedded file).
pub fn check_json(spectrum_json: &str, thresholds_json: &str) -> EngineResult<String> {
    let t = if thresholds_json.trim().is_empty() {
        Thresholds::embedded()?
    } else {
        Thresholds::parse(thresholds_json)?
    };
    let s = crate::confronti::opzioni::parse_query(spectrum_json)?;
    Ok(check(&s, &t)?.to_json())
}
