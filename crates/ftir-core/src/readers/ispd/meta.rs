//! Decoded fields (name, date, history, parameters) and the standard metadata taken from them.
use super::fields::decoded;
use super::objects::{iso_utc, Header};
use super::params::{self, Value};
use crate::readers::model::{Field, FieldKind, Instrument, Severity, Sourced, Spectrum, Warning};

/// Names the instrument software gives to its own objects: not a sample, not a person.
fn fixed_name(n: &str) -> bool {
    let digits = n
        .strip_prefix("Subtraction")
        .is_some_and(|r| r.chars().all(|c| c.is_ascii_digit()));
    digits
        || matches!(
            n,
            "Interferogram"
                | "Background Interferogram"
                | "FTIRX000 Instrument Parameters"
                | "DPO_DATAFILE_EXTEND_INFO"
        )
}

/// Indices (in the field list) of what `header_fields` created.
pub struct HeaderIndex {
    pub name: usize,
    pub created: usize,
    pub history: Vec<usize>,
}

/// Appends the fields decoded from an object header: name, creation date, and per history entry text, author, date.
pub fn header_fields(fields: &mut Vec<Field>, id: u32, h: &Header) -> HeaderIndex {
    let at = |s: &str| format!("object {id} · NON_BTREE_DATA · {s}");
    fields.push(decoded(
        at("name"),
        "NAME",
        h.name.clone(),
        FieldKind::Text,
        !fixed_name(&h.name),
    ));
    let name = fields.len() - 1;
    let created = iso_utc(h.created_unix);
    fields.push(decoded(
        at("created"),
        "CREATED",
        created,
        FieldKind::Date,
        true,
    ));
    let created = fields.len() - 1;
    let mut history = Vec::new();
    for (i, e) in h.history.iter().flatten().enumerate() {
        let n = i + 1;
        fields.push(decoded(
            at(&format!("history {n}")),
            "HISTORY",
            e.text.clone(),
            FieldKind::Text,
            true,
        ));
        history.push(fields.len() - 1);
        let who = if e.aux.is_empty() || e.aux == "NA" {
            format!("{} / {}", e.user, e.full_name)
        } else {
            format!("{} / {} / {}", e.user, e.full_name, e.aux)
        };
        fields.push(decoded(
            at(&format!("history {n} author")),
            "HISTORY_AUTHOR",
            who,
            FieldKind::Text,
            true,
        ));
        fields.push(decoded(
            at(&format!("history {n} date")),
            "HISTORY_DATE",
            iso_utc(e.unix),
            FieldKind::Date,
            true,
        ));
    }
    HeaderIndex {
        name,
        created,
        history,
    }
}

fn sourced<T>(value: T, field: usize) -> Option<Sourced<T>> {
    Some(Sourced { value, field })
}

/// Title, date, history and the standard values that history lines state (serial number, accessory).
pub fn apply_header(s: &mut Spectrum, h: &Header, ix: &HeaderIndex) {
    s.measurement.title = sourced(h.name.clone(), ix.name);
    s.measurement.datetime = sourced(iso_utc(h.created_unix), ix.created);
    for (e, &field) in h.history.iter().flatten().zip(&ix.history) {
        s.history.push(e.text.clone());
        let after = |marker: &str| {
            e.text
                .split_once(marker)
                .map(|(_, rest)| rest.trim().to_string())
                .filter(|v| !v.is_empty())
        };
        if let Some(sn) = after("SNO:") {
            s.instrument.serial_number = sourced(sn, field);
        }
        if let Some(acc) = e.text.strip_prefix("Measured with accessory:") {
            s.instrument.accessory = sourced(acc.trim().to_string(), field);
            s.instrument.sampling = crate::campionamento::classify(acc);
        }
        if e.text.to_ascii_lowercase().contains("out of range") {
            s.warnings.push(
                Warning::new("reader.ispd.instrument_alert", Severity::Caution)
                    .with("message", &e.text),
            );
        }
    }
}

fn param_field(p: &Value) -> (String, FieldKind) {
    match p {
        Value::Int(v) => (v.to_string(), FieldKind::Integer),
        Value::Byte(v) => (v.to_string(), FieldKind::Integer),
        Value::Real(v) => (v.to_string(), FieldKind::Real),
        Value::Text(t) => (t.clone(), FieldKind::Text),
    }
}

/// Appends one field per parameter to `fields` and fills the standard instrument values.
pub fn apply_params(
    fields: &mut Vec<Field>,
    ins: &mut Instrument,
    parsed: &params::Parsed,
    object: u32,
) -> Vec<Warning> {
    let mut warnings = Vec::new();
    for p in &parsed.params {
        let (value, kind) = param_field(&p.value);
        let mut f = decoded(
            format!("object {object} · parameter {}", p.id),
            &format!("param.{}", p.id),
            value,
            kind,
            p.id == 1032,
        );
        f.known = params::KNOWN_IDS.contains(&p.id);
        fields.push(f);
        let at = fields.len() - 1;
        match (p.id, &p.value) {
            (1004, Value::Real(v)) => ins.resolution_cm1 = sourced(*v, at),
            (1002, Value::Int(v)) => {
                ins.scans = u32::try_from(*v).ok().and_then(|n| sourced(n, at))
            }
            (1200, Value::Text(t)) if !t.trim().is_empty() => {
                ins.model = sourced(t.trim().to_string(), at)
            }
            _ => {}
        }
        if p.guessed {
            warnings
                .push(Warning::new("reader.ispd.param_guessed", Severity::Info).with("id", p.id));
        }
    }
    warnings
}
