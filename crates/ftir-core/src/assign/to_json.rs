//! `assignment/1` as JSON (`docs/schemi/assignment-1.json`).
use super::result::{Assignment, Item, ReferenceId, Summary, SCHEMA};
use crate::passi::json::Value;

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

fn num(x: f64) -> Value {
    Value::Num(x)
}

fn opt(s: Option<&str>) -> Value {
    s.map_or(Value::Null, text)
}

fn reference(r: &ReferenceId) -> Value {
    Value::Obj(vec![
        ("spectrum_id".into(), opt(r.spectrum_id.as_deref())),
        ("substance_id".into(), text(&r.substance_id)),
        ("form".into(), text(&r.form)),
        ("library".into(), opt(r.library.as_deref())),
        ("version".into(), opt(r.version.as_deref())),
    ])
}

fn item(i: &Item) -> Value {
    let by = i.explained_by.as_ref().map_or(Value::Null, |e| {
        Value::Obj(vec![
            ("substance_id".into(), text(&e.substance_id)),
            ("form".into(), text(&e.form)),
            ("ref_peak_id".into(), text(&e.ref_peak_id)),
            ("ref_peak_cm1".into(), num(e.ref_peak_cm1)),
            ("delta_cm1".into(), num(e.delta_cm1)),
        ])
    });
    Value::Obj(vec![
        ("peak_id".into(), text(&i.peak_id)),
        ("state".into(), text(i.state.id())),
        ("explained_by".into(), by),
        ("interpretations".into(), Value::Arr(Vec::new())),
        ("suspects".into(), Value::Arr(Vec::new())),
    ])
}

fn summary(s: &Summary) -> Value {
    let count = |n: usize| num(n as f64);
    Value::Obj(vec![
        ("no_reference".into(), Value::Bool(s.no_reference)),
        ("n_main".into(), count(s.n_main)),
        ("n_explained".into(), count(s.n_explained)),
        (
            "n_unexplained".into(),
            s.n_unexplained.map_or(Value::Null, count),
        ),
        ("n_missing".into(), count(s.n_missing)),
    ])
}

fn missing(a: &Assignment) -> Value {
    let list = a.missing_expected.iter().map(|m| {
        Value::Obj(vec![
            ("ref_peak_id".into(), text(&m.ref_peak_id)),
            ("ref_peak_cm1".into(), num(m.ref_peak_cm1)),
            ("prominence_rel".into(), num(m.prominence_rel)),
        ])
    });
    Value::Arr(list.collect())
}

impl Assignment {
    pub fn to_value(&self) -> Value {
        let list = |v: Vec<Value>| Value::Arr(v);
        Value::Obj(vec![
            ("schema".into(), text(SCHEMA)),
            (
                "sample_spectrum_id".into(),
                opt(self.sample_spectrum_id.as_deref()),
            ),
            (
                "reference".into(),
                self.reference.as_ref().map_or(Value::Null, reference),
            ),
            (
                "components".into(),
                list(self.components.iter().map(reference).collect()),
            ),
            ("bands_version".into(), Value::Null),
            ("items".into(), list(self.items.iter().map(item).collect())),
            ("missing_expected".into(), missing(self)),
            ("summary".into(), summary(&self.summary)),
        ])
    }

    pub fn to_json(&self) -> String {
        self.to_value().write()
    }
}
