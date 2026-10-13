//! Shimadzu `.ispd` reader (`shimadzu-ispd`): a Berkeley DB hash file with numbered objects.
//!
//! Every pair of the database becomes a field; objects with data become spectra (the main spectrum, interferograms of
//! sample and background, subtractions); the header of each object gives name, date and history; the parameter list of
//! the instrument gives resolution, scans and model. Peak tables and other undecoded blocks stay unknown fields.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod fields;
mod meta;
mod objects;
mod params;
mod spectrum;

use super::bdb::{self, Kind};
use super::model::{
    Confidence, Document, Field, Limits, Options, Provenance, ReadError, ReadResult, Severity,
    Spectrum, Warning,
};
use super::sha256::sha256_hex;
use super::Reader;
use spectrum::Obj;
use std::collections::BTreeMap;

pub use fields::KNOWN;
pub use params::KNOWN_IDS;

pub const ID: &str = "shimadzu-ispd";
pub const VERSION: &str = "2";

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// Content first (Berkeley DB magic), then the extension.
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    let ext = name.to_ascii_lowercase().ends_with(".ispd");
    match bdb::sniff(head) {
        Some(Kind::Hash { .. }) if ext => Confidence::Certain,
        Some(_) if ext => Confidence::Likely,
        Some(Kind::Hash { .. }) => Confidence::Likely,
        _ => Confidence::No,
    }
}

struct Built {
    spectra: Vec<Spectrum>,
    ids: Vec<u32>,
    primary: usize,
}

/// Builds the spectrum of every object with data; only the main spectrum is mandatory.
fn build_spectra(
    objs: &[Obj<'_, '_>],
    limits: &Limits,
    warnings: &mut Vec<Warning>,
) -> ReadResult<Built> {
    let mut b = Built {
        spectra: Vec::new(),
        ids: Vec::new(),
        primary: usize::MAX,
    };
    let mut main_error: Option<ReadError> = None;
    for o in objs.iter().filter(|o| o.has_data()) {
        match spectrum::build(o, limits) {
            Ok(s) => {
                if b.primary == usize::MAX && o.is_main() {
                    b.primary = b.spectra.len();
                }
                b.spectra.push(s);
                b.ids.push(o.id);
                if b.spectra.len() > limits.max_spectra {
                    return Err(ReadError::limit("spectra", limits.max_spectra));
                }
            }
            Err(e) if e.key == "reader.limit_exceeded" => return Err(e),
            Err(e) => {
                warnings.push(
                    Warning::new("reader.ispd.object_skipped", Severity::Caution)
                        .with("object", o.id)
                        .with("reason", e.key),
                );
                if o.is_main() && main_error.is_none() {
                    main_error = Some(e);
                }
            }
        }
    }
    if b.primary == usize::MAX {
        return Err(main_error.unwrap_or_else(|| ReadError::new("reader.ispd.no_spectrum")));
    }
    Ok(b)
}

/// Pairs and decoded header fields go to the spectrum of their object, or to the document.
fn distribute(
    list: &[objects::Entry<'_>],
    objs: &[Obj<'_, '_>],
    b: &mut Built,
    doc: &mut Vec<Field>,
    warnings: &mut Vec<Warning>,
) {
    for e in list {
        let f = fields::field_of(e);
        match b.ids.iter().position(|&i| i == e.object) {
            Some(k) => b.spectra.get_mut(k).map(|s| s.fields.push(f)),
            None => {
                doc.push(f);
                None
            }
        };
    }
    let mut latin1 = false;
    for o in objs {
        let Some(h) = &o.header else { continue };
        latin1 |= h.latin1;
        match b
            .ids
            .iter()
            .position(|&i| i == o.id)
            .and_then(|k| b.spectra.get_mut(k))
        {
            Some(s) => {
                let ix = meta::header_fields(&mut s.fields, o.id, h);
                meta::apply_header(s, h, &ix);
            }
            None => {
                meta::header_fields(doc, o.id, h);
            }
        }
    }
    if latin1 {
        warnings.push(Warning::new("reader.ispd.text_latin1", Severity::Info));
    }
}

/// The parameter list of the instrument, attached to the main spectrum.
fn apply_parameters(
    by_obj: &BTreeMap<u32, objects::Props<'_, '_>>,
    b: &mut Built,
    warnings: &mut Vec<Warning>,
) {
    let found = by_obj.iter().find_map(|(n, props)| {
        props
            .iter()
            .find(|(k, _)| k.starts_with("103700"))
            .map(|(_, e)| (*n, e.value))
    });
    let Some((object, value)) = found else { return };
    let Some(parsed) = params::parse(value) else {
        warnings.push(
            Warning::new("reader.ispd.params_unreadable", Severity::Caution).with("object", object),
        );
        return;
    };
    if let Some(s) = b.spectra.get_mut(b.primary) {
        let mut ins = std::mem::take(&mut s.instrument);
        warnings.extend(meta::apply_params(&mut s.fields, &mut ins, &parsed, object));
        s.instrument = ins;
    }
    let seen = warnings.iter().any(|w| w.key == "reader.ispd.text_latin1");
    if parsed.latin1 && !seen {
        warnings.push(Warning::new("reader.ispd.text_latin1", Severity::Info));
    }
}

/// One document-level warning per distinct instrument alert, with the number of spectra that carry it.
fn alerts(spectra: &[Spectrum]) -> Vec<Warning> {
    let mut count: BTreeMap<&str, usize> = BTreeMap::new();
    for w in spectra.iter().flat_map(|s| s.warnings.iter()) {
        if w.key == "reader.ispd.instrument_alert" {
            if let Some((_, m)) = w.params.iter().find(|(n, _)| *n == "message") {
                *count.entry(m.as_str()).or_default() += 1;
            }
        }
    }
    count
        .into_iter()
        .map(|(m, n)| {
            Warning::new("reader.ispd.instrument_alert", Severity::Caution)
                .with("message", m)
                .with("count", n)
        })
        .collect()
}

pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    let pairs = bdb::read_hash(bytes, limits)?;
    let list = objects::entries(&pairs);
    let by_obj = objects::by_object(&list);
    let objs: Vec<Obj<'_, '_>> = by_obj.iter().map(|(n, p)| spectrum::obj(*n, p)).collect();
    let mut warnings = Vec::new();
    let mut b = build_spectra(&objs, limits, &mut warnings)?;
    let mut doc_fields = Vec::new();
    distribute(&list, &objs, &mut b, &mut doc_fields, &mut warnings);
    apply_parameters(&by_obj, &mut b, &mut warnings);
    let main = objs.iter().find(|o| b.ids.get(b.primary) == Some(&o.id));
    if let (Some(o), Some(s)) = (main, b.spectra.get_mut(b.primary)) {
        spectrum::check_declared(o, s);
        if o.header.is_none() {
            warnings.push(
                Warning::new("reader.ispd.header_unreadable", Severity::Info).with("object", o.id),
            );
        }
    }
    for s in &mut b.spectra {
        fields::map_spectrum_fields(&mut s.fields);
    }
    warnings.extend(alerts(&b.spectra));
    let unknown = doc_fields
        .iter()
        .chain(b.spectra.iter().flat_map(|s| s.fields.iter()))
        .filter(|f| !f.known)
        .count();
    if unknown > 0 {
        warnings.push(Warning::new("reader.fields_unknown", Severity::Info).with("count", unknown));
    }
    let page = bytes
        .get(20..24)
        .and_then(|s| <[u8; 4]>::try_from(s).ok())
        .map(u32::from_le_bytes)
        .unwrap_or(0);
    Ok(Document {
        spectra: b.spectra,
        primary: b.primary,
        fields: doc_fields,
        warnings,
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Shimadzu ISPD".to_string(),
            variant: format!("Berkeley DB hash {}, page {page}", bdb::HASH_VERSION),
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}
