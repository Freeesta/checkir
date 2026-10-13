//! Shimadzu `.ispd` reader (`shimadzu-ispd`): a Berkeley DB hash file with numbered objects.
//!
//! Version 1 reads the container and the main spectrum (x axis in `cm-1` or `1/cm`); every other pair stays a field.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod build;
mod objects;

use super::bdb::{self, Kind};
use super::model::{
    Confidence, Document, Limits, Options, Provenance, ReadError, ReadResult, Severity, Warning,
};
use super::sha256::sha256_hex;
use super::Reader;

pub use build::KNOWN;

pub const ID: &str = "shimadzu-ispd";
pub const VERSION: &str = "1";

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

pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    let pairs = bdb::read_hash(bytes, limits)?;
    let list = objects::entries(&pairs);
    let by_obj = objects::by_object(&list);
    let main = by_obj
        .iter()
        .map(|(n, props)| build::candidate(*n, props))
        .find(build::is_main)
        .ok_or_else(|| ReadError::new("reader.ispd.no_spectrum"))?;
    let mut own = Vec::new();
    let mut doc_fields = Vec::new();
    for e in &list {
        let f = build::field_of(e);
        if e.object == main.object {
            own.push(f);
        } else {
            doc_fields.push(f);
        }
    }
    let spectrum = build::spectrum(&main, own, limits)?;
    let mut warnings: Vec<Warning> = Vec::new();
    if main.name.is_none() {
        warnings.push(
            Warning::new("reader.ispd.header_unreadable", Severity::Info)
                .with("object", main.object),
        );
    }
    let all_fields = doc_fields.iter().chain(spectrum.fields.iter());
    let unknown = all_fields.filter(|f| !f.known).count();
    if unknown > 0 {
        warnings.push(Warning::new("reader.fields_unknown", Severity::Info).with("count", unknown));
    }
    let page = bytes
        .get(20..24)
        .and_then(|s| <[u8; 4]>::try_from(s).ok())
        .map(u32::from_le_bytes)
        .unwrap_or(0);
    Ok(Document {
        spectra: vec![spectrum],
        primary: 0,
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
