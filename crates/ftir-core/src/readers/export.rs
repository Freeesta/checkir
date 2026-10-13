//! Deterministic JSON text of a `Document` (the export format of the readers; also what the anonymity test inspects).
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::model::{Background, Document, Field, Sourced, Spectrum, Warning, XValues};

fn s(v: &str) -> String {
    let mut o = String::with_capacity(v.len() + 2);
    o.push('"');
    for c in v.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn nums(v: &[f64]) -> String {
    v.iter().map(f64::to_string).collect::<Vec<_>>().join(",")
}

fn opt(v: &Option<Sourced<String>>) -> String {
    v.as_ref().map_or("null".to_string(), |x| s(&x.value))
}

fn field(f: &Field) -> String {
    format!(
        "{{\"origin\":{},\"key\":{},\"value\":{},\"kind\":\"{:?}\",\"mapped\":{},\"identity\":{},\"known\":{}}}",
        s(&f.origin),
        s(&f.key),
        s(&f.value),
        f.kind,
        f.mapped.map_or("null".to_string(), s),
        f.identity,
        f.known
    )
}

fn warning(w: &Warning) -> String {
    let p: Vec<String> = w
        .params
        .iter()
        .map(|(k, v)| format!("{}:{}", s(k), s(v)))
        .collect();
    format!(
        "{{\"key\":{},\"severity\":\"{:?}\",\"params\":{{{}}}}}",
        s(w.key),
        w.severity,
        p.join(",")
    )
}

fn list<T>(v: &[T], f: fn(&T) -> String) -> String {
    v.iter().map(f).collect::<Vec<_>>().join(",")
}

fn spectrum(sp: &Spectrum) -> String {
    let x = match &sp.x.values {
        XValues::Regular { first, last, n } => {
            format!("{{\"first\":{first},\"last\":{last},\"n\":{n}}}")
        }
        XValues::Explicit(v) => format!("[{}]", nums(v)),
    };
    format!(
        "{{\"role\":\"{:?}\",\"x\":{{\"unit\":\"{:?}\",\"order\":\"{:?}\",\"values\":{x}}},\
         \"y\":{{\"unit\":\"{:?}\",\"quantum\":{},\"values\":[{}]}},\
         \"instrument\":{{\"model\":{},\"resolution_cm1\":{},\"scans\":{},\"serial_number\":{},\"accessory\":{}}},\
         \"measurement\":{{\"title\":{},\"sample_name\":{},\"datetime\":{}}},\
         \"history\":[{}],\"fields\":[{}],\"warnings\":[{}]}}",
        sp.role,
        sp.x.unit,
        sp.x.order,
        sp.y.unit,
        sp.y.quantum.map_or("null".to_string(), |q| q.to_string()),
        nums(&sp.y.values),
        opt(&sp.instrument.model),
        sp.instrument
            .resolution_cm1
            .as_ref()
            .map_or("null".to_string(), |r| r.value.to_string()),
        sp.instrument
            .scans
            .as_ref()
            .map_or("null".to_string(), |r| r.value.to_string()),
        opt(&sp.instrument.serial_number),
        opt(&sp.instrument.accessory),
        opt(&sp.measurement.title),
        opt(&sp.measurement.sample_name),
        opt(&sp.measurement.datetime),
        sp.history
            .iter()
            .map(|h| s(h))
            .collect::<Vec<_>>()
            .join(","),
        list(&sp.fields, field),
        list(&sp.warnings, warning)
    )
}

fn background(b: &Background) -> String {
    format!(
        "{{\"present\":\"{}\",\"spectrum_index\":{},\"digest\":{}}}",
        b.present.name(),
        b.spectrum_index
            .map_or("null".to_string(), |i| i.to_string()),
        b.digest.as_deref().map_or("null".to_string(), s)
    )
}

/// The whole document as one JSON text, identical byte for byte for identical documents.
pub fn to_json(d: &Document) -> String {
    format!(
        "{{\"provenance\":{{\"reader\":{},\"version\":{},\"format\":{},\"variant\":{},\"sha256\":{},\"size\":{}}},\
         \"primary\":{},\"background\":{},\"fields\":[{}],\"warnings\":[{}],\"spectra\":[{}]}}\n",
        s(d.provenance.reader),
        s(d.provenance.reader_version),
        s(&d.provenance.format),
        s(&d.provenance.variant),
        s(&d.provenance.sha256),
        d.provenance.size,
        d.primary,
        background(&d.background),
        list(&d.fields, field),
        list(&d.warnings, warning),
        list(&d.spectra, spectrum)
    )
}
