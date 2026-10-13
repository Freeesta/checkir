//! JCAMP-DX reader (`jcamp-dx`): AFFN, PAC, SQZ/DIF/DUP, XYPOINTS, PEAK TABLE and LINK blocks.
//!
//! Nothing is lost: every record becomes a field of the block (or of the document for link blocks and the preamble),
//! the tables become spectra, and every check that fails becomes a warning.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
pub mod asdf;
mod data;
pub mod meta;
pub mod text;

use super::model::{
    Background, Confidence, Document, Limits, Options, Provenance, ReadError, ReadResult, Severity,
    Warning,
};
use super::sha256::sha256_hex;
use super::Reader;
use text::{Item, Ldr};

pub const ID: &str = "jcamp-dx";
pub const VERSION: &str = "1";

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// Content first (`##TITLE=` or `##JCAMP-DX=` at the start), then the extension.
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    let (text, _, _) = text::decode(head);
    let first = text.lines().map(str::trim).find(|l| !l.is_empty());
    if let Some(l) = first {
        let norm = text::normalize(l);
        if norm.starts_with("##TITLE=") || norm.starts_with("##JCAMPDX=") {
            return Confidence::Certain;
        }
    }
    let lower = name.to_ascii_lowercase();
    let ext_ok = [".dx", ".jdx", ".jcm", ".jcamp"]
        .iter()
        .any(|e| lower.ends_with(e));
    if ext_ok && first.is_some_and(|l| l.starts_with("##")) {
        Confidence::Likely
    } else {
        Confidence::No
    }
}

/// A block being assembled: `link` blocks only contain other blocks and document-level fields.
struct Open {
    items: Vec<Item>,
    link: bool,
}

struct Parsed {
    spectra: Vec<super::model::Spectrum>,
    doc_items: Vec<Item>,
    warnings: Vec<Warning>,
    forms: asdf::Forms,
    version: String,
}

fn version_of(items: &[Item]) -> Option<String> {
    items.iter().find_map(|i| match i {
        Item::Ldr(l) if l.label == "JCAMPDX" => Some(l.value.clone()),
        _ => None,
    })
}

pub fn open(bytes: &[u8], limits: &Limits, options: &Options) -> ReadResult<Document> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    let (text, fell_back, bom) = text::decode(bytes);
    if super::text::is_headered_table(&text) {
        return super::text::open(bytes, limits, options);
    }
    let items = text::scan(&text, limits)?;
    if !items.iter().any(|i| matches!(i, Item::Ldr(_))) {
        return Err(ReadError::new("reader.jcamp.not_jcamp"));
    }
    let mut p = assemble(items, limits)?;
    if p.spectra.is_empty() {
        return Err(ReadError::new("reader.jcamp.no_data"));
    }
    let mut warnings = Vec::new();
    if fell_back {
        warnings.push(Warning::new("reader.encoding_fallback", Severity::Caution));
    }
    if bom {
        warnings.push(Warning::new("reader.bom_removed", Severity::Info));
    }
    warnings.append(&mut p.warnings);
    let fields = meta::fields_of(&p.doc_items);
    if fields.len() > limits.max_fields {
        return Err(ReadError::limit("fields", limits.max_fields));
    }
    warnings.extend(meta::unknown_warning(&fields));
    let version = version_of(&p.doc_items).unwrap_or_else(|| p.version.clone());
    let background = Background::find(&p.spectra);
    Ok(Document {
        spectra: p.spectra,
        background,
        primary: 0,
        fields,
        warnings,
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "JCAMP-DX".to_string(),
            variant: variant(&version, p.forms),
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}

fn variant(version: &str, f: asdf::Forms) -> String {
    let mut forms = Vec::new();
    for (on, name) in [
        (f.sqz, "SQZ"),
        (f.dif, "DIF"),
        (f.dup, "DUP"),
        (f.pac, "PAC"),
    ] {
        if on {
            forms.push(name);
        }
    }
    let form = if forms.is_empty() {
        "AFFN".to_string()
    } else {
        forms.join("+")
    };
    if version.is_empty() {
        format!("form {form}")
    } else {
        format!("JCAMP-DX {version}, form {form}")
    }
}

fn label_of(item: &Item) -> Option<&Ldr> {
    match item {
        Item::Ldr(l) => Some(l),
        _ => None,
    }
}

/// Groups the records into blocks (`##TITLE=` ... `##END=`, nested in `LINK` blocks) and builds the spectra.
fn assemble(items: Vec<Item>, limits: &Limits) -> ReadResult<Parsed> {
    let mut p = Parsed {
        spectra: Vec::new(),
        doc_items: Vec::new(),
        warnings: Vec::new(),
        forms: asdf::Forms::default(),
        version: String::new(),
    };
    let mut stack: Vec<Open> = Vec::new();
    for item in items {
        let label = label_of(&item).map(|l| l.label.clone());
        match label.as_deref() {
            Some("TITLE") => {
                if stack.last().is_some_and(|o| !o.link) {
                    finish(&mut stack, &mut p, limits, true)?;
                }
                if stack.len() >= limits.max_chain {
                    return Err(ReadError::limit("chain", limits.max_chain));
                }
                stack.push(Open {
                    items: vec![item],
                    link: false,
                });
            }
            Some("END") => {
                if let Some(o) = stack.last_mut() {
                    o.items.push(item);
                    finish(&mut stack, &mut p, limits, false)?;
                } else {
                    p.doc_items.push(item);
                }
            }
            other => {
                let is_link = other == Some("DATATYPE")
                    && label_of(&item).is_some_and(|l| text::normalize(&l.value).contains("LINK"));
                match stack.last_mut() {
                    Some(o) => {
                        o.link |= is_link;
                        o.items.push(item);
                    }
                    None => p.doc_items.push(item),
                }
            }
        }
        if p.spectra.len() > limits.max_spectra {
            return Err(ReadError::limit("spectra", limits.max_spectra));
        }
    }
    while !stack.is_empty() {
        finish(&mut stack, &mut p, limits, true)?;
    }
    Ok(p)
}

/// Closes the innermost block. A block without data goes to the document fields.
fn finish(
    stack: &mut Vec<Open>,
    p: &mut Parsed,
    limits: &Limits,
    missing_end: bool,
) -> ReadResult<()> {
    let Some(block) = stack.pop() else {
        return Ok(());
    };
    if missing_end {
        p.warnings
            .push(Warning::new("reader.jcamp.end_missing", Severity::Caution));
    }
    let has_table = block
        .items
        .iter()
        .filter_map(label_of)
        .any(|l| l.is_data() || l.label == "NTUPLES");
    if block.link || !has_table {
        p.doc_items.extend(block.items);
        return Ok(());
    }
    if p.version.is_empty() {
        p.version = version_of(&block.items).unwrap_or_default();
    }
    let built = data::build(&block.items, limits)?;
    p.forms.sqz |= built.forms.sqz;
    p.forms.dif |= built.forms.dif;
    p.forms.dup |= built.forms.dup;
    p.forms.pac |= built.forms.pac;
    p.spectra.extend(built.spectra);
    Ok(())
}
