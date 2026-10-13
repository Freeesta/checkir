//! Fields: one per pair of the database (nothing is lost) and the fields decoded from them.
use super::objects::{Entry, CATALOG};
use crate::readers::model::{Field, FieldKind};
use crate::readers::sha256::sha256_hex;

/// Properties listed in `tests/audit/noti_ispd.txt` (a test keeps both equal). The peak tables (`100400`…) are not
/// decoded yet and stay unknown on purpose.
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
    "103700 FTIRX000 Instrument Parameters",
    "103701",
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

/// A field decoded from a pair (its origin starts with `decoded`): the pair itself stays as a field too.
pub fn decoded(origin: String, key: &str, value: String, kind: FieldKind, identity: bool) -> Field {
    Field {
        origin: format!("decoded · {origin}"),
        key: key.to_string(),
        original_key: key.to_string(),
        value,
        kind,
        unit: None,
        mapped: None,
        identity,
        known: true,
    }
}

/// Marks the pairs that were turned into the axes and units of a spectrum.
pub fn map_spectrum_fields(fields: &mut [Field]) {
    for f in fields {
        match f.key.as_str() {
            "100008" => f.mapped = Some("y"),
            "100036" => f.mapped = Some("x"),
            "100001" => f.mapped = Some("x_unit"),
            "100003" => f.mapped = Some("y_unit"),
            _ => {}
        }
    }
}
