//! Bruker OPUS reader (`bruker-opus`): a directory of blocks, parameter lists and float32 series.
//!
//! The main spectrum is the absorbance block `AB`; without it, `-log10(ScSm / ScRf)` computed from the single-channel
//! spectra of sample and background (marked as computed by checkIR). The axis comes from `FXV`, `LXV` and `NPT`; resolution
//! and scans from the acquisition parameters. Every parameter is a field; names, operators, paths, serial numbers, dates and
//! free texts are `identity`. Every length is checked against the file and the limits before anything is allocated.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod data;
mod directory;
mod meta;
mod params;
mod series;

use super::model::{
    Background, Confidence, Document, Limits, Options, Provenance, ReadError, ReadResult, Severity,
    Spectrum, Warning,
};
use super::sha256::sha256_hex;
use super::Reader;
use directory::{classify, Class};
use series::Item;
use std::collections::BTreeSet;

pub use meta::KNOWN;

pub const ID: &str = "bruker-opus";
pub const VERSION: &str = "1";

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// The signature of the header decides; the name is not looked at.
pub fn detect(_name: &str, head: &[u8]) -> Confidence {
    if head.get(..4) == Some(&directory::MAGIC[..]) {
        Confidence::Certain
    } else {
        Confidence::No
    }
}

/// Lists the fields of the blocks that are not data series: the shared ones go to the main spectrum (first block of each
/// kind), the rest (background, repeated and unknown blocks) to the document.
fn shared_fields(
    items: &[Item<'_>],
    limits: &Limits,
    used: &BTreeSet<usize>,
    warnings: &mut Vec<Warning>,
) -> (
    Vec<super::model::Field>,
    Vec<super::model::Field>,
    Vec<String>,
) {
    let (mut main, mut doc, mut history) = (Vec::new(), Vec::new(), Vec::new());
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for it in items.iter().filter(|i| !used.contains(&i.b.n)) {
        let Some(chunk) = it.chunk else {
            warnings.push(
                Warning::new("reader.opus.block_truncated", Severity::Caution)
                    .with("object", it.b.n),
            );
            continue;
        };
        let n = it.b.n;
        match it.class {
            Class::Params(prefix) => {
                let p = params::parse(chunk, limits.max_fields);
                if p.broken {
                    warnings.push(
                        Warning::new("reader.opus.params_unreadable", Severity::Caution)
                            .with("object", n),
                    );
                }
                let target = if prefix.ends_with("_RF") || !seen.insert(prefix) {
                    &mut doc
                } else {
                    &mut main
                };
                target.extend(meta::param_fields(prefix, n, &p.params));
            }
            Class::Text(key) => {
                let f = meta::text_field(key, n, chunk);
                if key == "HISTORY" && seen.insert(key) {
                    history.extend(
                        f.value
                            .lines()
                            .map(str::trim)
                            .filter(|l| !l.is_empty())
                            .map(String::from),
                    );
                    main.push(f);
                } else {
                    doc.push(f);
                }
            }
            Class::Data(kind) => doc.push(meta::bytes_field(kind.key(), n, chunk)),
            Class::DataParams(kind) => {
                let p = params::parse(chunk, limits.max_fields);
                doc.extend(meta::param_fields(
                    &format!("PARAMS_{}", kind.key()),
                    n,
                    &p.params,
                ));
            }
            Class::Other => doc.push(meta::bytes_field(&format!("BLOCK.{}", n), n, chunk)),
        }
    }
    (main, doc, history)
}

pub fn open(bytes: &[u8], limits: &Limits, _options: &Options) -> ReadResult<Document> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    let blocks = directory::parse(bytes, limits)?;
    let items: Vec<Item<'_>> = blocks
        .iter()
        .map(|b| Item {
            b: *b,
            class: classify(b),
            chunk: b.chunk(bytes),
        })
        .collect();
    let mut warnings = Vec::new();
    let mut used = BTreeSet::new();
    let list = series::all(&items, limits, &mut warnings, &mut used)?;
    let mut spectra = series::with_primary(list, &mut warnings)?;
    if spectra.len() > limits.max_spectra {
        return Err(ReadError::limit("spectra", limits.max_spectra));
    }
    let (main, doc_fields, history) = shared_fields(&items, limits, &used, &mut warnings);
    let primary: &mut Spectrum = spectra
        .first_mut()
        .ok_or_else(|| ReadError::new("reader.opus.no_spectrum"))?;
    primary.fields.extend(main);
    primary.history.extend(history);
    meta::apply(primary);
    let total = doc_fields.len() + spectra.iter().map(|s| s.fields.len()).sum::<usize>();
    if total > limits.max_fields {
        return Err(ReadError::limit("fields", limits.max_fields));
    }
    let unknown = doc_fields
        .iter()
        .chain(spectra.iter().flat_map(|s| s.fields.iter()))
        .filter(|f| !f.known)
        .count();
    if unknown > 0 {
        warnings.push(Warning::new("reader.fields_unknown", Severity::Info).with("count", unknown));
    }
    let background = Background::find(&spectra);
    Ok(Document {
        spectra,
        primary: 0,
        background,
        fields: doc_fields,
        warnings,
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Bruker OPUS".to_string(),
            variant: format!("{} blocks", blocks.len()),
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}
