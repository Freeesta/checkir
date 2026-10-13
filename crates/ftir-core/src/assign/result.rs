//! The result of the assignment, `assignment/1` (schema in `docs/schemi/assignment-1.json`): for every peak of the
//! sample the state, who explains it (a substance, never a group rule) and the bands of the reference the sample lacks.
use crate::passi::json::Value;

pub const SCHEMA: &str = "assignment/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Explained,
    ExplainedOtherForm,
    Unexplained,
    Minor,
    Artifact,
}

impl State {
    pub fn id(self) -> &'static str {
        match self {
            State::Explained => "explained",
            State::ExplainedOtherForm => "explained_other_form",
            State::Unexplained => "unexplained",
            State::Minor => "minor",
            State::Artifact => "artifact",
        }
    }
}

/// Identity of a reference spectrum (the candidate, a component of a mixture or another form of the same substance).
#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceId {
    pub spectrum_id: Option<String>,
    pub substance_id: String,
    pub form: String,
    pub library: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Explanation {
    pub substance_id: String,
    pub form: String,
    pub ref_peak_id: String,
    pub ref_peak_cm1: f64,
    pub delta_cm1: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub peak_id: String,
    pub state: State,
    pub explained_by: Option<Explanation>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Missing {
    pub ref_peak_id: String,
    pub ref_peak_cm1: f64,
    pub prominence_rel: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Summary {
    pub no_reference: bool,
    pub n_main: usize,
    pub n_explained: usize,
    /// `None` without a reference: the count would alarm for nothing.
    pub n_unexplained: Option<usize>,
    pub n_missing: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Assignment {
    pub sample_spectrum_id: Option<String>,
    /// The candidate; `None` without any reference.
    pub reference: Option<ReferenceId>,
    pub components: Vec<ReferenceId>,
    pub items: Vec<Item>,
    pub missing_expected: Vec<Missing>,
    pub summary: Summary,
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

fn num(x: f64) -> Value {
    Value::Num(x)
}

fn opt(s: Option<&str>) -> Value {
    s.map_or(Value::Null, text)
}

impl ReferenceId {
    fn to_value(&self) -> Value {
        Value::Obj(vec![
            ("spectrum_id".into(), opt(self.spectrum_id.as_deref())),
            ("substance_id".into(), text(&self.substance_id)),
            ("form".into(), text(&self.form)),
            ("library".into(), opt(self.library.as_deref())),
            ("version".into(), opt(self.version.as_deref())),
        ])
    }
}

impl Item {
    fn to_value(&self) -> Value {
        let by = self.explained_by.as_ref().map_or(Value::Null, |e| {
            Value::Obj(vec![
                ("substance_id".into(), text(&e.substance_id)),
                ("form".into(), text(&e.form)),
                ("ref_peak_id".into(), text(&e.ref_peak_id)),
                ("ref_peak_cm1".into(), num(e.ref_peak_cm1)),
                ("delta_cm1".into(), num(e.delta_cm1)),
            ])
        });
        Value::Obj(vec![
            ("peak_id".into(), text(&self.peak_id)),
            ("state".into(), text(self.state.id())),
            ("explained_by".into(), by),
            ("interpretations".into(), Value::Arr(Vec::new())),
            ("suspects".into(), Value::Arr(Vec::new())),
        ])
    }
}

impl Summary {
    fn to_value(&self) -> Value {
        let count = |n: usize| num(n as f64);
        Value::Obj(vec![
            ("no_reference".into(), Value::Bool(self.no_reference)),
            ("n_main".into(), count(self.n_main)),
            ("n_explained".into(), count(self.n_explained)),
            (
                "n_unexplained".into(),
                self.n_unexplained.map_or(Value::Null, count),
            ),
            ("n_missing".into(), count(self.n_missing)),
        ])
    }
}

impl Assignment {
    pub fn to_value(&self) -> Value {
        let missing = self.missing_expected.iter().map(|m| {
            Value::Obj(vec![
                ("ref_peak_id".into(), text(&m.ref_peak_id)),
                ("ref_peak_cm1".into(), num(m.ref_peak_cm1)),
                ("prominence_rel".into(), num(m.prominence_rel)),
            ])
        });
        Value::Obj(vec![
            ("schema".into(), text(SCHEMA)),
            (
                "sample_spectrum_id".into(),
                opt(self.sample_spectrum_id.as_deref()),
            ),
            (
                "reference".into(),
                self.reference
                    .as_ref()
                    .map_or(Value::Null, ReferenceId::to_value),
            ),
            (
                "components".into(),
                Value::Arr(self.components.iter().map(ReferenceId::to_value).collect()),
            ),
            ("bands_version".into(), Value::Null),
            (
                "items".into(),
                Value::Arr(self.items.iter().map(Item::to_value).collect()),
            ),
            ("missing_expected".into(), Value::Arr(missing.collect())),
            ("summary".into(), self.summary.to_value()),
        ])
    }

    pub fn to_json(&self) -> String {
        self.to_value().write()
    }
}
