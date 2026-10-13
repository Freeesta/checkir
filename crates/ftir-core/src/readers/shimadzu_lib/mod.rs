//! Shimadzu IRsolution library reader (`shimadzu-lib`): the `.L01` data file of a `.IDX/.nam/.L01` group, one spectrum per
//! entry, and the entry names from the `.nam` file (Berkeley DB hash) when it is passed to [`open_named`].
//!
//! Layout (checked against a library and its JCAMP twin): 72-byte header with three little-endian doubles at offset 8 (high
//! end, low end, step, in cm-1); `n = (high - low) / step + 1`; record `k` holds `n` unsigned bytes at `112 + k * (n + 40)`,
//! x ascending. The instrument keeps each spectrum normalised to 0..255, so the absolute scale is lost (`reader.scale_lost`).
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::bdb;
use super::le::{self, decoded, f64_at};
use super::model::{
    Background, Confidence, Document, Field, FieldKind, Limits, Measurement, Options, Order,
    Provenance, ReadError, ReadResult, Role, Severity, Sourced, Spectrum, Warning, XAxis, XUnit,
    XValues, YAxis, YUnit,
};
use super::sha256::sha256_hex;
use super::Reader;

pub const ID: &str = "shimadzu-lib";
pub const VERSION: &str = "1";
const MAGIC: &[u8] = b"IRS\0";
const HEADER: usize = 72;
/// Offset of the first record's data inside the file; each record is `n` data bytes plus 40 of its own.
const DATA_AT: usize = 112;
const RECORD_EXTRA: usize = 40;
const MAX_STEP_CM1: f64 = 16.0;

/// Keys of the fields this reader produces (listed in the cleaning contract).
pub const KNOWN: &[&str] = &["DESCRIPTION", "ENTRY", "NAME"];

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// The axis of the library: `(low, high, step, n)`.
struct Axis {
    low: f64,
    high: f64,
    n: usize,
}

/// Reads and validates the header; `None` when it is not a plausible spectral library header.
fn axis(head: &[u8]) -> Option<Axis> {
    if !head.starts_with(MAGIC) {
        return None;
    }
    let (high, low, step) = (f64_at(head, 8)?, f64_at(head, 16)?, f64_at(head, 24)?);
    let ok = [high, low, step].iter().all(|v| v.is_finite())
        && low > 0.0
        && high > low
        && step > 0.0
        && step <= MAX_STEP_CM1;
    if !ok {
        return None;
    }
    let span = ((high - low) / step).round();
    if !(1.0..=1.0e7).contains(&span) || ((high - low) - span * step).abs() > step * 1e-6 {
        return None;
    }
    Some(Axis {
        low,
        high,
        n: format!("{span:.0}").parse::<usize>().ok()?.checked_add(1)?,
    })
}

/// The signature and a plausible axis; the `.L01` extension makes it certain.
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    if axis(head).is_none() {
        return Confidence::No;
    }
    if name.to_ascii_lowercase().ends_with(".l01") {
        Confidence::Certain
    } else {
        Confidence::Likely
    }
}

/// `(entry number from 1, property, text)` of a `.nam` pair whose key reads `<x> <entry> <PROPERTY>`.
fn name_pair(p: &bdb::Pair) -> Option<(usize, String, String)> {
    let key = le::text(&p.key);
    let mut it = key.split(' ');
    let (kind, entry, prop) = (it.next()?, it.next()?, it.next()?);
    if it.next().is_some() || kind.parse::<u32>().is_err() {
        return None;
    }
    Some((entry.parse().ok()?, prop.to_string(), le::text(&p.value)))
}

/// Entry names and descriptions from the `.nam` file: `names[k]` / `descriptions[k]` for entry `k` (0-based).
fn names(nam: &[u8], count: usize, limits: &Limits) -> ReadResult<(Vec<String>, Vec<String>)> {
    let mut names = vec![String::new(); count];
    let mut descriptions = vec![String::new(); count];
    for pair in bdb::read_hash(nam, limits)? {
        let Some((entry, prop, text)) = name_pair(&pair) else {
            continue;
        };
        let slot = match prop.as_str() {
            "NAME" => names.get_mut(entry.wrapping_sub(1)),
            "DESCRIPTION" => descriptions.get_mut(entry.wrapping_sub(1)),
            _ => None,
        };
        if let Some(s) = slot {
            if s.is_empty() {
                *s = text.chars().take(limits.max_value_len).collect();
            }
        }
    }
    Ok((names, descriptions))
}

fn entry_spectrum(record: &[u8], k: usize, axis: &Axis, name: &str, description: &str) -> Spectrum {
    let at = format!("record {}", k + 1);
    let mut fields = vec![decoded(
        &at,
        "ENTRY",
        (k + 1).to_string(),
        FieldKind::Integer,
        false,
    )];
    let mut title = None;
    if !name.is_empty() {
        let mut f: Field = decoded(&at, "NAME", name.to_string(), FieldKind::Text, true);
        f.mapped = Some("title");
        title = Some(Sourced {
            value: name.to_string(),
            field: fields.len(),
        });
        fields.push(f);
    }
    if !description.is_empty() {
        fields.push(decoded(
            &at,
            "DESCRIPTION",
            description.to_string(),
            FieldKind::Text,
            true,
        ));
    }
    Spectrum {
        role: Role::Reference,
        x: XAxis {
            unit: XUnit::Cm1,
            order: Order::Ascending,
            values: XValues::Regular {
                first: axis.low,
                last: axis.high,
                n: axis.n,
            },
        },
        y: YAxis {
            unit: YUnit::Arbitrary,
            values: record.iter().map(|&b| f64::from(b)).collect(),
            quantum: Some(1.0),
        },
        instrument: Default::default(),
        measurement: Measurement {
            title,
            sample_name: None,
            datetime: None,
        },
        history: Vec::new(),
        fields,
        warnings: Vec::new(),
    }
}

/// Opens the `.L01` file alone: the entries have no names (they live in the `.nam` file).
pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    open_named(bytes, None, limits)
}

/// Opens the `.L01` file and, when given, the `.nam` file of the same library: entry `k` takes the name stored for it.
pub fn open_named(l01: &[u8], nam: Option<&[u8]>, limits: &Limits) -> ReadResult<Document> {
    if l01.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    if !l01.starts_with(MAGIC) {
        return Err(ReadError::new("reader.shimadzu_lib.not_lib"));
    }
    let axis = axis(l01).ok_or_else(|| ReadError::new("reader.shimadzu_lib.bad_header"))?;
    if axis.n > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    let stride = axis.n + RECORD_EXTRA;
    let body = l01.len().saturating_sub(HEADER);
    if body == 0 || !body.is_multiple_of(stride) {
        return Err(ReadError::new("reader.shimadzu_lib.bad_size")
            .with("size", l01.len())
            .with("expected", stride));
    }
    let count = body / stride;
    if count > limits.max_spectra {
        return Err(ReadError::limit("spectra", limits.max_spectra));
    }
    let (names, descriptions) = match nam {
        Some(nam) => names(nam, count, limits)?,
        None => (vec![String::new(); count], vec![String::new(); count]),
    };
    let mut spectra = Vec::with_capacity(count);
    for k in 0..count {
        let record = le::slice(l01, DATA_AT + k * stride, axis.n)
            .ok_or_else(|| ReadError::new("reader.shimadzu_lib.bad_size"))?;
        let (n, d) = (names.get(k), descriptions.get(k));
        let (n, d) = (n.map_or("", String::as_str), d.map_or("", String::as_str));
        spectra.push(entry_spectrum(record, k, &axis, n, d));
    }
    Ok(Document {
        background: Background::find(&spectra),
        spectra,
        primary: 0,
        fields: Vec::new(),
        warnings: vec![Warning::new("reader.scale_lost", Severity::Info).with("count", count)],
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Shimadzu IRsolution library".to_string(),
            variant: format!("{} entries, {} points", count, axis.n),
            sha256: sha256_hex(l01),
            size: l01.len(),
        },
    })
}

#[cfg(test)]
mod test;
