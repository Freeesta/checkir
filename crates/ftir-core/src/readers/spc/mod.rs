//! Galactic SPC reader (`galactic-spc`), new format (version byte 0x4B, little-endian): uniform x axis or x values (one array,
//! or one per subfile), several subfiles, intensities as float32 or as 16/32-bit integers with exponent. The old format
//! (0x4D) and the big-endian one (0x4C) are refused with their own error. The date and the comment identify (removed on export).
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod header;
mod subfile;

use super::le::decoded;
use super::model::{
    Background, Confidence, Document, Field, FieldKind, Instrument, Limits, Measurement, Options,
    Order, Provenance, ReadError, ReadResult, Role, Sourced, Spectrum, XAxis, XUnit, XValues,
    YAxis,
};
use super::sha256::sha256_hex;
use super::Reader;
use header::Header;
use subfile::Sub;

pub const ID: &str = "galactic-spc";
pub const VERSION: &str = "1";

/// Keys of the fields this reader produces (listed in the cleaning contract).
pub const KNOWN: &[&str] = &[
    "COMMENT", "DATE", "FIRSTX", "LASTX", "NPOINTS", "SUBFILE", "XUNITS", "YUNITS",
];

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// A version byte of the family is not enough on its own: with the extension it is certain, without it the header must look
/// like one (non-zero points, known x and y type codes).
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    let version = head.get(1).copied();
    if !matches!(version, Some(0x4B..=0x4D)) {
        return Confidence::No;
    }
    if name.to_ascii_lowercase().ends_with(".spc") {
        return Confidence::Certain;
    }
    match Header::parse(head) {
        Ok(h) if h.npts > 0 && header::x_unit(h.x_code).is_ok() && h.y_code <= 131 => {
            Confidence::Likely
        }
        _ => Confidence::No,
    }
}

fn order_of(x: &[f64]) -> Order {
    let pairs = || x.iter().zip(x.iter().skip(1));
    if pairs().all(|(a, b)| a < b) {
        Order::Ascending
    } else if pairs().all(|(a, b)| a > b) {
        Order::Descending
    } else {
        Order::Unordered
    }
}

fn axis(h: &Header, sub: &Sub, unit: XUnit) -> ReadResult<XAxis> {
    if let Some(x) = &sub.x {
        return Ok(XAxis {
            unit,
            order: order_of(x),
            values: XValues::Explicit(x.clone()),
        });
    }
    let n = sub.y.len();
    if !h.first.is_finite() || !h.last.is_finite() || h.first == h.last {
        return Err(ReadError::new("reader.spc.bad_data").with("why", "axis"));
    }
    let order = if h.last > h.first {
        Order::Ascending
    } else {
        Order::Descending
    };
    Ok(XAxis {
        unit,
        order,
        values: XValues::Regular {
            first: h.first,
            last: h.last,
            n,
        },
    })
}

/// Fields shared by every subfile: the comment and the date identify; the axis description does not.
fn fields(h: &Header, index: usize, n: usize) -> Vec<Field> {
    let at = "main header";
    let mut out = Vec::new();
    if !h.comment.is_empty() {
        out.push(decoded(
            at,
            "COMMENT",
            h.comment.clone(),
            FieldKind::Text,
            true,
        ));
    }
    if let Some(d) = header::date(h.date) {
        let mut f = decoded(at, "DATE", d, FieldKind::Date, true);
        f.mapped = Some("datetime");
        out.push(f);
    }
    out.push(decoded(
        at,
        "NPOINTS",
        n.to_string(),
        FieldKind::Integer,
        false,
    ));
    out.push(decoded(
        at,
        "FIRSTX",
        h.first.to_string(),
        FieldKind::Real,
        false,
    ));
    out.push(decoded(
        at,
        "LASTX",
        h.last.to_string(),
        FieldKind::Real,
        false,
    ));
    out.push(decoded(
        at,
        "XUNITS",
        h.x_code.to_string(),
        FieldKind::Integer,
        false,
    ));
    out.push(decoded(
        at,
        "YUNITS",
        h.y_code.to_string(),
        FieldKind::Integer,
        false,
    ));
    out.push(decoded(
        at,
        "SUBFILE",
        (index + 1).to_string(),
        FieldKind::Integer,
        false,
    ));
    out
}

fn spectrum(h: &Header, index: usize, sub: Sub, unit: XUnit) -> ReadResult<Spectrum> {
    let mut warnings = Vec::new();
    let y_unit = header::y_unit(h.y_code, &sub.y, &mut warnings);
    let x = axis(h, &sub, unit)?;
    let fields = fields(h, index, sub.y.len());
    let datetime = fields
        .iter()
        .position(|f| f.mapped == Some("datetime"))
        .and_then(|k| {
            Some(Sourced {
                value: fields.get(k)?.value.clone(),
                field: k,
            })
        });
    Ok(Spectrum {
        role: Role::Unknown,
        x,
        y: YAxis {
            unit: y_unit,
            values: sub.y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement {
            title: None,
            sample_name: None,
            datetime,
        },
        history: Vec::new(),
        fields,
        warnings,
    })
}

pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    let h = Header::parse(bytes)?;
    let unit = header::x_unit(h.x_code)?;
    let subs = subfile::read_all(bytes, &h, limits)?;
    let count = subs.len();
    let spectra = subs
        .into_iter()
        .enumerate()
        .map(|(i, s)| spectrum(&h, i, s, unit))
        .collect::<ReadResult<Vec<_>>>()?;
    Ok(Document {
        background: Background::find(&spectra),
        spectra,
        primary: 0,
        fields: Vec::new(),
        warnings: Vec::new(),
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Galactic SPC".to_string(),
            variant: format!("new format, {count} subfile(s)"),
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}
