//! Cleaning contract `anonimizza/1` (rule R5): for every reader, every metadata field is kept, generalised (date → `YYYY-MM`)
//! or stripped; a field the contract does not list is stripped. `clean` applies it to a COPY of the metadata (the original is
//! never touched) and returns the cleaning report: which fields were stripped or generalised, never their values.
//! The stable pseudonyms of `readers::anonymize` are a different tool (comparing files inside one service); the contract
//! removes instead of replacing, and reuses its date reduction.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use crate::readers::anonymize::year_month;
use crate::readers::model::{Document, Field, Sourced, Spectrum, Warning};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// A physical parameter or a format field: stays as it is.
    Keep,
    /// A date: reduced to year and month (stripped if it cannot be read).
    Coarsen,
    /// Anything that can identify a person, a place, a machine or a sample, and anything unknown.
    Strip,
}

impl Action {
    /// The word used by the schema and the catalogs.
    pub fn word(self) -> &'static str {
        match self {
            Action::Keep => "tieni",
            Action::Coarsen => "generalizza",
            Action::Strip => "togli",
        }
    }
}

/// A key is matched exactly, or as a prefix when it ends with `*`. The first matching rule wins.
#[derive(Debug, Clone, Copy)]
pub struct Rule {
    pub key: &'static str,
    pub action: Action,
}

#[derive(Debug, Clone, Copy)]
pub struct ReaderRules {
    pub reader: &'static str,
    pub rules: &'static [Rule],
}

mod tabelle;
pub use tabelle::{CONTRACT, WARNING_PARAMS_KEPT};

fn matches(pattern: &str, key: &str) -> bool {
    match pattern.strip_suffix('*') {
        Some(prefix) => key.starts_with(prefix),
        None => pattern == key,
    }
}

/// The action the contract lists for a key, or `None` when it does not (the field is then stripped).
pub fn listed_action(reader: &str, key: &str) -> Option<Action> {
    let table = CONTRACT.iter().find(|r| r.reader == reader)?;
    table
        .rules
        .iter()
        .find(|r| matches(r.key, key))
        .map(|r| r.action)
}

/// The action applied to a key: unknown reader or unknown key = strip.
pub fn action_for(reader: &str, key: &str) -> Action {
    listed_action(reader, key).unwrap_or(Action::Strip)
}

/// One line of the cleaning report. Keys of fields the contract does not list are shown as `(unknown field)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    /// `document` or `spectrum N` (from 1).
    pub scope: String,
    pub key: String,
    pub action: Action,
    pub count: usize,
}

/// What was stripped or generalised, and how many fields stayed. It never carries a value.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Report {
    pub changes: Vec<Change>,
    pub kept: usize,
}

impl Report {
    fn note(&mut self, scope: &str, key: &str, action: Action) {
        match self
            .changes
            .iter_mut()
            .find(|c| c.scope == scope && c.key == key && c.action == action)
        {
            Some(c) => c.count += 1,
            None => self.changes.push(Change {
                scope: scope.to_string(),
                key: key.to_string(),
                action,
                count: 1,
            }),
        }
    }
}

/// Cleans a list of fields; returns the kept ones and, for every old index, its new index (`None` = stripped).
fn clean_fields(
    reader: &str,
    scope: &str,
    fields: &[Field],
    report: &mut Report,
) -> (Vec<Field>, Vec<Option<usize>>) {
    let mut out = Vec::new();
    let mut map = Vec::with_capacity(fields.len());
    for f in fields {
        let listed = listed_action(reader, &f.key);
        let mut action = listed.unwrap_or(Action::Strip);
        // A field the reader marks as identifying never stays as it is, whatever the table says.
        if action == Action::Keep && f.identity {
            action = Action::Strip;
        }
        let shown = if listed.is_some() {
            f.key.as_str()
        } else {
            "(unknown field)"
        };
        let mut kept = f.clone();
        if action == Action::Coarsen {
            match year_month(&f.value) {
                Some(month) => kept.value = month,
                None => action = Action::Strip,
            }
        }
        if action == Action::Keep {
            report.kept += 1;
        } else {
            report.note(scope, shown, action);
        }
        if action == Action::Strip {
            map.push(None);
        } else {
            out.push(kept);
            map.push(Some(out.len() - 1));
        }
    }
    (out, map)
}

/// A standard value follows its source field: gone when the field is gone, re-pointed otherwise.
fn follow<T>(s: Option<Sourced<T>>, map: &[Option<usize>]) -> Option<Sourced<T>> {
    let s = s?;
    let field = (*map.get(s.field)?)?;
    Some(Sourced { field, ..s })
}

fn clean_warnings(scope: &str, warnings: &mut [Warning], report: &mut Report) {
    for w in warnings {
        let before = w.params.len();
        w.params
            .retain(|(name, _)| WARNING_PARAMS_KEPT.contains(name));
        for _ in w.params.len()..before {
            report.note(scope, &format!("warning {}", w.key), Action::Strip);
        }
    }
}

fn clean_spectrum(reader: &str, n: usize, s: &Spectrum, report: &mut Report) -> Spectrum {
    let scope = format!("spectrum {n}");
    let mut out = s.clone();
    let (fields, map) = clean_fields(reader, &scope, &s.fields, report);
    out.fields = fields;
    let m = &mut out.measurement;
    m.title = follow(m.title.take(), &map);
    m.sample_name = follow(m.sample_name.take(), &map);
    m.datetime = follow(m.datetime.take(), &map)
        .and_then(|d| year_month(&d.value).map(|value| Sourced { value, ..d }));
    let i = &mut out.instrument;
    i.model = follow(i.model.take(), &map);
    i.resolution_cm1 = follow(i.resolution_cm1.take(), &map);
    i.scans = follow(i.scans.take(), &map);
    i.serial_number = follow(i.serial_number.take(), &map);
    i.accessory = follow(i.accessory.take(), &map);
    for _ in &s.history {
        report.note(&scope, "history", Action::Strip);
    }
    out.history.clear();
    clean_warnings(&scope, &mut out.warnings, report);
    out
}

/// The cleaned copy of a document and its report. Data (axes, values, units, roles) and provenance are untouched.
pub fn clean(doc: &Document) -> (Document, Report) {
    let reader = doc.provenance.reader;
    let mut report = Report::default();
    let mut out = doc.clone();
    out.fields = clean_fields(reader, "document", &doc.fields, &mut report).0;
    clean_warnings("document", &mut out.warnings, &mut report);
    out.spectra = doc
        .spectra
        .iter()
        .enumerate()
        .map(|(i, s)| clean_spectrum(reader, i + 1, s, &mut report))
        .collect();
    (out, report)
}

fn json_text(v: &str) -> String {
    format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
}

/// The contract as the JSON document `anonimizza/1` (checked against `docs/schemi/anonimizza-1.json`).
pub fn contract_json() -> String {
    let mut readers = Vec::new();
    for r in CONTRACT {
        let fields: Vec<String> = r
            .rules
            .iter()
            .map(|x| format!("{}:{}", json_text(x.key), json_text(x.action.word())))
            .collect();
        readers.push(format!(
            "{}:{{\"fields\":{{{}}}}}",
            json_text(r.reader),
            fields.join(",")
        ));
    }
    let kept: Vec<String> = WARNING_PARAMS_KEPT.iter().map(|p| json_text(p)).collect();
    format!(
        "{{\"schema\":\"anonimizza/1\",\"default\":\"togli\",\"warning_params_kept\":[{}],\"readers\":{{{}}}}}\n",
        kept.join(","),
        readers.join(",")
    )
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn first_match_wins_and_unknown_is_strip() {
        assert_eq!(action_for("shimadzu-ispd", "param.1032"), Action::Strip);
        assert_eq!(action_for("shimadzu-ispd", "param.1004"), Action::Keep);
        assert_eq!(listed_action("jcamp-dx", "OWNER"), Some(Action::Strip));
        assert_eq!(action_for("jcamp-dx", "SOMETHING_NEW"), Action::Strip);
        assert_eq!(action_for("no-such-reader", "FIRSTX"), Action::Strip);
    }

    #[test]
    fn contract_json_is_one_line_per_schema_rules() {
        let j = contract_json();
        assert!(j.starts_with("{\"schema\":\"anonimizza/1\""));
        assert!(j.contains("\"OWNER\":\"togli\"") && j.contains("\"LONGDATE\":\"generalizza\""));
    }
}
