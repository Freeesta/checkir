//! Fields of a block: identity and known lists, kinds, and the mapping to the standard fields.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::text::{Item, Ldr};
use crate::readers::model::{
    Field, FieldKind, Instrument, Measurement, Severity, Sourced, Warning,
};

/// Labels that identify a person, a place, a sample or a machine (contract §5.2).
pub const IDENTITY: [&str; 11] = [
    "TITLE",
    "ORIGIN",
    "OWNER",
    "SAMPLINGPROCEDURE",
    "SAMPLEDESCRIPTION",
    "DATE",
    "LONGDATE",
    "SOURCEREFERENCE",
    "SPECTROMETERDATASYSTEM",
    "PERSON",
    "NOTES",
];

/// Labels the reader knows (also written in `tests/audit/noti_jcamp.txt`, which a test keeps in step). Sorted.
pub const KNOWN: &[&str] = &[
    "BLOCKID",
    "BLOCKS",
    "CASNAME",
    "CASREGISTRYNO",
    "CROSSREFERENCE",
    "DATATABLE",
    "DATATYPE",
    "DATE",
    "DELTAX",
    "END",
    "FIRSTX",
    "FIRSTY",
    "JCAMPDX",
    "LASTX",
    "LONGDATE",
    "MAXX",
    "MAXY",
    "MINX",
    "MINY",
    "MOLFORM",
    "MW",
    "NAMES",
    "NOTES",
    "NPOINTS",
    "ORIGIN",
    "OWNER",
    "PEAKTABLE",
    "PERSON",
    "RESOLUTION",
    "SAMPLEDESCRIPTION",
    "SAMPLINGPROCEDURE",
    "SOURCEREFERENCE",
    "SPECTROMETERDATASYSTEM",
    "TITLE",
    "XFACTOR",
    "XUNITS",
    "XYDATA",
    "XYPOINTS",
    "YFACTOR",
    "YUNITS",
    "ZPD",
];

pub fn is_known(label: &str) -> bool {
    KNOWN.contains(&label)
}

fn kind_of(label: &str) -> FieldKind {
    match label {
        "NPOINTS" => FieldKind::Integer,
        "FIRSTX" | "LASTX" | "DELTAX" | "FIRSTY" | "MINX" | "MAXX" | "MINY" | "MAXY"
        | "XFACTOR" | "YFACTOR" | "MW" | "ZPD" => FieldKind::Real,
        "DATE" | "LONGDATE" => FieldKind::Date,
        _ => FieldKind::Text,
    }
}

fn from_ldr(l: &Ldr) -> Field {
    Field {
        origin: format!("line {} ##{}", l.line, l.raw_label),
        key: l.label.clone(),
        original_key: l.raw_label.clone(),
        value: l.full_value(),
        kind: kind_of(&l.label),
        unit: None,
        mapped: None,
        identity: IDENTITY.contains(&l.label.as_str()),
        known: is_known(&l.label),
    }
}

/// All fields of a list of items, in file order. `##END` is not a field (see `scarti_jcamp.txt`).
pub fn fields_of(items: &[Item]) -> Vec<Field> {
    let mut out = Vec::new();
    for it in items {
        match it {
            Item::Ldr(l) if l.label == "END" => {}
            Item::Ldr(l) => out.push(from_ldr(l)),
            Item::Comment { line, text } => out.push(Field {
                origin: format!("line {line} comment"),
                key: "$$".to_string(),
                original_key: "$$".to_string(),
                value: text.clone(),
                kind: FieldKind::Text,
                unit: None,
                mapped: None,
                identity: true,
                known: true,
            }),
            Item::Stray { line, text } => out.push(Field {
                origin: format!("line {line} text"),
                key: "(TEXT)".to_string(),
                original_key: String::new(),
                value: text.clone(),
                kind: FieldKind::Text,
                unit: None,
                mapped: None,
                identity: true,
                known: false,
            }),
        }
    }
    out
}

/// Summary warning for unknown keys (one per scope).
pub fn unknown_warning(fields: &[Field]) -> Option<Warning> {
    let n = fields.iter().filter(|f| !f.known).count();
    (n > 0).then(|| Warning::new("reader.fields_unknown", Severity::Info).with("count", n))
}

fn field_index(fields: &[Field], key: &str) -> Option<usize> {
    fields.iter().position(|f| f.key == key)
}

fn text_of(fields: &[Field], key: &str) -> Option<Sourced<String>> {
    let i = field_index(fields, key)?;
    let f = fields.get(i)?;
    let v = f.value.trim();
    (!v.is_empty()).then(|| Sourced {
        value: v.to_string(),
        field: i,
    })
}

/// `YYYY/MM/DD [HH:MM:SS]` (JCAMP `LONG DATE`) to ISO 8601; anything else is not interpreted.
pub fn iso_long_date(v: &str) -> Option<String> {
    let mut parts = v.split_whitespace();
    let date = parts.next()?;
    let time = parts.next();
    let nums: Vec<&str> = date.split(['/', '-']).collect();
    let ok = |s: &str, n: usize| s.len() == n && s.bytes().all(|b| b.is_ascii_digit());
    let [y, m, d] = nums.as_slice() else {
        return None;
    };
    if !(ok(y, 4) && ok(m, 2) && ok(d, 2)) {
        return None;
    }
    let mut out = format!("{y}-{m}-{d}");
    if let Some(t) = time {
        let hms: Vec<&str> = t.split(':').collect();
        let main: Vec<&str> = hms
            .iter()
            .map(|s| s.split('.').next().unwrap_or(""))
            .collect();
        if main.len() < 2 || !main.iter().all(|s| ok(s, 2)) {
            return None;
        }
        out.push('T');
        out.push_str(t);
    }
    Some(out)
}

/// `d/m/y` style dates that cannot be told from `m/d/y`: both leading numbers are at most 12 and differ.
pub fn date_is_ambiguous(v: &str) -> bool {
    let nums: Vec<u32> = v
        .split(['/', '-', '.'])
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect();
    matches!(nums.as_slice(), [a, b, _] if a != b && *a <= 12 && *b <= 12)
}

/// Fills the standard fields from the field list and marks the fields as `mapped`.
pub fn standard(fields: &mut [Field], warnings: &mut Vec<Warning>) -> (Instrument, Measurement) {
    let mut ins = Instrument {
        model: text_of(fields, "SPECTROMETERDATASYSTEM"),
        ..Instrument::default()
    };
    let mut mea = Measurement {
        title: text_of(fields, "TITLE"),
        sample_name: text_of(fields, "SAMPLEDESCRIPTION"),
        ..Measurement::default()
    };
    if let Some(s) = text_of(fields, "RESOLUTION") {
        let lead: String = s
            .value
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        ins.resolution_cm1 = lead.parse::<f64>().ok().map(|v| Sourced {
            value: v,
            field: s.field,
        });
    }
    if let Some(s) = text_of(fields, "LONGDATE") {
        mea.datetime = iso_long_date(&s.value).map(|v| Sourced {
            value: v,
            field: s.field,
        });
    }
    if let Some(s) = text_of(fields, "DATE") {
        if date_is_ambiguous(&s.value) {
            warnings.push(
                Warning::new("reader.jcamp.date_ambiguous", Severity::Info).with("value", &s.value),
            );
        }
    }
    let marks = [
        (mea.title.as_ref().map(|s| s.field), "measurement.title"),
        (
            mea.sample_name.as_ref().map(|s| s.field),
            "measurement.sample_name",
        ),
        (
            mea.datetime.as_ref().map(|s| s.field),
            "measurement.datetime",
        ),
        (ins.model.as_ref().map(|s| s.field), "instrument.model"),
        (
            ins.resolution_cm1.as_ref().map(|s| s.field),
            "instrument.resolution_cm1",
        ),
    ];
    for (idx, name) in marks {
        if let Some(f) = idx.and_then(|i| fields.get_mut(i)) {
            f.mapped = Some(name);
        }
    }
    (ins, mea)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(
            iso_long_date("2018/05/09 14:22:11").as_deref(),
            Some("2018-05-09T14:22:11")
        );
        assert_eq!(iso_long_date("2018/05/09").as_deref(), Some("2018-05-09"));
        assert_eq!(iso_long_date("5/9/2018"), None);
        assert!(date_is_ambiguous("5/9/2018"));
        assert!(!date_is_ambiguous("17/8/2018"));
    }

    #[test]
    fn known_list_is_sorted() {
        assert!(KNOWN.windows(2).all(|w| w.first() < w.get(1)));
    }
}
