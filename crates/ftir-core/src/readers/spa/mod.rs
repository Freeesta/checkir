//! Thermo OMNIC `.spa` reader (`thermo-spa`): a section table, a header with the x axis (first and last wavenumber, number of
//! points), float32 intensities, and the title, date, comments and history as fields that identify (removed on export).
//! Layout from the public descriptions of the format; the interferogram sections are not decoded.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod info;
mod table;

use super::ispd::iso_utc;
use super::le::{self, decoded, f32_at};
use super::model::{
    Background, Confidence, Document, Field, FieldKind, Instrument, Limits, Measurement, Options,
    Order, Provenance, ReadError, ReadResult, Role, Sourced, Spectrum, Warning, XAxis, XValues,
    YAxis,
};
use super::sha256::sha256_hex;
use super::Reader;
use table::Section;

pub const ID: &str = "thermo-spa";
pub const VERSION: &str = "1";
const MAGIC: &[u8] = b"Spectral Data File";
const TITLE_AT: usize = 30;
const TITLE_LEN: usize = 256;
const DATE_AT: usize = 296;
/// OMNIC counts seconds from 1899-12-31; Unix time from 1970-01-01.
const EPOCH_OFFSET_S: u32 = 2_209_075_200;

/// Keys of the fields this reader produces (listed in the cleaning contract).
pub const KNOWN: &[&str] = &[
    "COMMENT", "DATE", "FIRSTX", "HISTORY", "LASTX", "NPOINTS", "TITLE", "XUNITS", "YUNITS",
];

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// The signature first; a group file (`.spg`) has the same signature and a different layout.
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    let lower = name.to_ascii_lowercase();
    match (head.starts_with(MAGIC), lower.ends_with(".spa")) {
        (true, true) => Confidence::Certain,
        (true, false) if !lower.ends_with(".spg") => Confidence::Likely,
        (false, true) => Confidence::Likely,
        _ => Confidence::No,
    }
}

fn cap(text: String, limits: &Limits) -> String {
    text.chars().take(limits.max_value_len).collect()
}

/// Title, date, comments and history: all of them identify and are removed or generalised by the anonymous export.
fn text_fields(file: &[u8], sections: &[Section], limits: &Limits) -> ReadResult<Vec<Field>> {
    let mut fields = Vec::new();
    let title = le::text(le::slice(file, TITLE_AT, TITLE_LEN).ok_or_else(table::truncated)?);
    if !title.is_empty() {
        let at = format!("byte {TITLE_AT} title");
        fields.push(decoded(
            &at,
            "TITLE",
            cap(title, limits),
            FieldKind::Text,
            true,
        ));
        if let Some(f) = fields.last_mut() {
            f.mapped = Some("title");
        }
    }
    let library = table::find(sections, table::LIBRARY_TEXT).is_some();
    let date = le::u32_at(file, DATE_AT)
        .and_then(|s| s.checked_sub(EPOCH_OFFSET_S))
        .map(iso_utc);
    if let (false, Some(date)) = (library, date) {
        let at = format!("byte {DATE_AT} date");
        fields.push(decoded(&at, "DATE", date, FieldKind::Date, true));
        if let Some(f) = fields.last_mut() {
            f.mapped = Some("datetime");
        }
    }
    for (key, name) in [(table::COMMENT, "COMMENT"), (table::HISTORY, "HISTORY")] {
        for s in sections.iter().filter(|s| s.key == key) {
            let text = le::texts(s.bytes(file)?).join("\n");
            if !text.is_empty() {
                let at = format!("section {key} at byte {}", s.pos);
                fields.push(decoded(&at, name, cap(text, limits), FieldKind::Text, true));
            }
        }
    }
    Ok(fields)
}

fn axis_fields(i: &info::Info) -> Vec<Field> {
    let at = "section 2 header";
    vec![
        decoded(at, "NPOINTS", i.n.to_string(), FieldKind::Integer, false),
        decoded(at, "FIRSTX", i.first.to_string(), FieldKind::Real, false),
        decoded(at, "LASTX", i.last.to_string(), FieldKind::Real, false),
        decoded(
            at,
            "XUNITS",
            i.x_code.to_string(),
            FieldKind::Integer,
            false,
        ),
        decoded(
            at,
            "YUNITS",
            i.y_code.to_string(),
            FieldKind::Integer,
            false,
        ),
    ]
}

/// The intensities (section 3): their number must be the one the header declares, checked before anything is allocated.
fn intensities(
    file: &[u8],
    sections: &[Section],
    i: &info::Info,
    limits: &Limits,
) -> ReadResult<Vec<f64>> {
    let bad = |why: &str| ReadError::new("reader.spa.bad_data").with("why", why);
    let sec = table::find(sections, table::DATA)
        .ok_or_else(|| ReadError::new("reader.spa.no_spectrum"))?;
    if i.n > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    if i.n < 2 || !i.first.is_finite() || !i.last.is_finite() || i.first == i.last {
        return Err(bad("axis"));
    }
    let raw = sec.bytes(file)?;
    if raw.len() != i.n.saturating_mul(4) {
        return Err(bad("points"));
    }
    Ok(raw
        .chunks_exact(4)
        .map(|c| f32_at(c, 0).map_or(f64::NAN, f64::from))
        .collect())
}

pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    if !bytes.starts_with(MAGIC) {
        return Err(ReadError::new("reader.spa.not_spa"));
    }
    let sections = table::read(bytes)?;
    let head = table::find(&sections, table::INFO)
        .ok_or_else(|| ReadError::new("reader.spa.no_spectrum"))?;
    let mut warnings: Vec<Warning> = Vec::new();
    let i = info::parse(head.bytes(bytes)?, &mut warnings)?;
    let y = intensities(bytes, &sections, &i, limits)?;
    let mut fields = text_fields(bytes, &sections, limits)?;
    let sourced = |name: &str| {
        fields
            .iter()
            .position(|f| f.mapped == Some(name))
            .and_then(|k| {
                Some(Sourced {
                    value: fields.get(k)?.value.clone(),
                    field: k,
                })
            })
    };
    let measurement = Measurement {
        title: sourced("title"),
        sample_name: None,
        datetime: sourced("datetime"),
    };
    let history: Vec<String> = fields
        .iter()
        .filter(|f| f.key == "HISTORY")
        .flat_map(|f| f.value.lines().map(str::to_string))
        .collect();
    fields.extend(axis_fields(&i));
    let spectrum = Spectrum {
        role: Role::Unknown,
        x: XAxis {
            unit: i.x_unit,
            order: if i.last > i.first {
                Order::Ascending
            } else {
                Order::Descending
            },
            values: XValues::Regular {
                first: i.first,
                last: i.last,
                n: i.n,
            },
        },
        y: YAxis {
            unit: i.y_unit,
            values: y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement,
        history,
        fields,
        warnings: Vec::new(),
    };
    let spectra = vec![spectrum];
    Ok(Document {
        background: Background::find(&spectra),
        spectra,
        primary: 0,
        fields: Vec::new(),
        warnings,
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Thermo OMNIC SPA".to_string(),
            variant: format!("{} sections", sections.len()),
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}
