//! Turns the entries of the database into fields and the main spectrum.
use super::objects::{self, Entry, CATALOG};
use crate::readers::model::{
    Field, FieldKind, Instrument, Limits, Measurement, Order, ReadError, ReadResult, Role,
    Severity, Sourced, Spectrum, Warning, XAxis, XUnit, XValues, YAxis, YUnit,
};
use crate::readers::sha256::sha256_hex;
use std::collections::BTreeMap;

/// Properties listed in `tests/audit/noti_ispd.txt` (a test keeps both equal).
pub const KNOWN: &[&str] = &[
    "0 ##$CORRECTIONDATE",
    "0 ##CASNAME",
    "0 ##DATE",
    "0 ##JCAMP-DX",
    "0 ##MINX",
    "0 ##MINY",
    "0 ##MOLFORM",
    "0 ##MW",
    "0 ##NAMES",
    "0 ##NOTES",
    "0 ##ORIGIN",
    "0 ##OWNER",
    "0 ##RESOLUTION",
    "0 ##SAMPLEDESCRIPTION",
    "0 ##SAMPLINGPROCEDURE",
    "0 ##SOURCEREFERENCE",
    "0 ##TITLE",
    "0 ##ZPD",
    "100000",
    "100001",
    "100003",
    "100004",
    "100008",
    "100022 0",
    "100022 2",
    "100036",
    "100400",
    "100401",
    "100600",
    "100700",
    "103700 FTIRX000 Instrument Parameters",
    "103701",
    "104500",
    "104501",
    "105600",
    "2 Description",
    "2 DisplayObject",
    "AO",
    "CD",
    "CO",
    "MEMBERS",
    "NON_BTREE_DATA",
];

/// Properties whose content names a person, a machine, a sample or a place (never exported in the clear).
const IDENTITY: &[&str] = &[
    "0 ##TITLE",
    "0 ##ORIGIN",
    "0 ##OWNER",
    "0 ##DATE",
    "0 ##SOURCEREFERENCE",
    "0 ##SAMPLINGPROCEDURE",
    "0 ##SAMPLEDESCRIPTION",
    "0 ##NOTES",
    "2 Description",
    "CD",
    "NON_BTREE_DATA",
];

fn printable(v: &[u8]) -> Option<String> {
    let body = v.strip_suffix(&[0]).unwrap_or(v);
    if body.len() > 4096 || body.iter().any(|b| !(0x20..0x7f).contains(b)) {
        return None;
    }
    Some(String::from_utf8_lossy(body).into_owned())
}

fn origin(e: &Entry<'_>) -> String {
    if e.object == CATALOG {
        format!("catalog · {}", e.rest)
    } else {
        format!("object {} · {}", e.object, e.rest.replace(' ', " · "))
    }
}

/// One field per entry; binary values are described by length and SHA-256, never copied.
pub fn field_of(e: &Entry<'_>) -> Field {
    let (value, kind) = match printable(e.value) {
        Some(t) => (t, FieldKind::Text),
        None => (
            format!("{} bytes, sha256 {}", e.value.len(), sha256_hex(e.value)),
            FieldKind::Bytes,
        ),
    };
    Field {
        origin: origin(e),
        key: e.rest.clone(),
        original_key: e.original.clone(),
        value,
        kind,
        unit: None,
        mapped: None,
        identity: IDENTITY.contains(&e.rest.as_str()),
        known: KNOWN.contains(&e.rest.as_str()),
    }
}

fn unit_text(v: &[u8]) -> Option<String> {
    let s = v.get(12..24.min(v.len()))?;
    let end = s.iter().position(|&b| b == 0).unwrap_or(s.len());
    std::str::from_utf8(s.get(..end)?).ok().map(str::to_string)
}

fn f64_at(b: &[u8], off: usize) -> Option<f64> {
    let s = b.get(off..off.checked_add(8)?)?;
    let mut a = [0u8; 8];
    a.copy_from_slice(s);
    Some(f64::from_le_bytes(a))
}

/// Everything needed to decide which object is the main spectrum.
pub struct Candidate<'a> {
    pub object: u32,
    pub props: &'a BTreeMap<&'a str, &'a Entry<'a>>,
    pub name: Option<String>,
    pub created: Option<u32>,
    pub x_unit: Option<String>,
}

pub fn candidate<'a>(object: u32, props: &'a BTreeMap<&'a str, &'a Entry<'a>>) -> Candidate<'a> {
    let head = props
        .get("NON_BTREE_DATA")
        .and_then(|e| objects::header(e.value));
    Candidate {
        object,
        props,
        name: head.as_ref().map(|h| h.name.clone()),
        created: head.map(|h| h.created_unix),
        x_unit: props.get("100001").and_then(|e| unit_text(e.value)),
    }
}

/// Rule of the main spectrum: x axis in cm-1, data and range present, name not `Subtraction…`; lowest object number.
pub fn is_main(c: &Candidate<'_>) -> bool {
    matches!(c.x_unit.as_deref(), Some("cm-1" | "1/cm"))
        && c.props.contains_key("100008")
        && c.props.contains_key("100036")
        && !c
            .name
            .as_deref()
            .is_some_and(|n| n.starts_with("Subtraction"))
}

fn y_unit(text: Option<&str>) -> (YUnit, Option<Warning>) {
    match text {
        Some("Abs") => (YUnit::Absorbance, None),
        Some("%T") => (YUnit::TransmittancePercent, None),
        Some("E") => (YUnit::SingleBeam, None),
        other => (
            YUnit::Unknown,
            Some(
                Warning::new("reader.ispd.yunits_unknown", Severity::Caution)
                    .with("value", other.unwrap_or("")),
            ),
        ),
    }
}

/// Builds the main spectrum. `fields` are the already built fields of the object, in order.
pub fn spectrum(
    c: &Candidate<'_>,
    mut fields: Vec<Field>,
    limits: &Limits,
) -> ReadResult<Spectrum> {
    let bad = || ReadError::new("reader.ispd.bad_data").with("object", c.object);
    let data = c.props.get("100008").ok_or_else(bad)?;
    let range = c.props.get("100036").ok_or_else(bad)?;
    let n = data.value.len() / 8;
    if n > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    if n < 2 || data.value.len() % 8 != 0 {
        return Err(bad());
    }
    let y: Vec<f64> = data
        .value
        .chunks_exact(8)
        .filter_map(|ch| f64_at(ch, 0))
        .collect();
    let first = f64_at(range.value, 16).ok_or_else(bad)?;
    let last = f64_at(range.value, 40).ok_or_else(bad)?;
    if y.iter().any(|v| !v.is_finite()) || !first.is_finite() || !last.is_finite() || first == last
    {
        return Err(bad());
    }
    let mut warnings = Vec::new();
    let (yu, w) = y_unit(
        c.props
            .get("100003")
            .and_then(|e| unit_text(e.value))
            .as_deref(),
    );
    warnings.extend(w);
    for f in &mut fields {
        match f.key.as_str() {
            "100008" => f.mapped = Some("y"),
            "100036" => f.mapped = Some("x"),
            "100001" => f.mapped = Some("x_unit"),
            "100003" => f.mapped = Some("y_unit"),
            _ => {}
        }
    }
    let index = |key: &str| fields.iter().position(|f| f.key == key);
    let title = c
        .name
        .as_ref()
        .zip(index("NON_BTREE_DATA"))
        .map(|(n, field)| Sourced {
            value: n.clone(),
            field,
        });
    let datetime = c
        .created
        .zip(index("NON_BTREE_DATA"))
        .map(|(t, field)| Sourced {
            value: objects::iso_utc(t),
            field,
        });
    Ok(Spectrum {
        role: Role::Unknown,
        x: XAxis {
            unit: XUnit::Cm1,
            order: if first < last {
                Order::Ascending
            } else {
                Order::Descending
            },
            values: XValues::Regular { first, last, n },
        },
        y: YAxis {
            unit: yu,
            values: y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement {
            title,
            sample_name: None,
            datetime,
        },
        history: Vec::new(),
        fields,
        warnings,
    })
}
