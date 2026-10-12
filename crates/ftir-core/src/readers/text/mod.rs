//! Reader of delimited text (`text-xy`): CSV, TXT and ASC exports with x and y columns, or y only with the axis in the header.
//!
//! Separator and decimal mark are found by trying every combination; when two readings stay possible the reader refuses
//! to guess (`reader.text.ambiguous`) and the page re-opens the file with the user's choice in `Options`.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
mod build;
pub mod numbers;

pub use build::AXIS_KEYS as KNOWN_KEYS;

use super::jcamp::text as jtext;
use super::model::{
    Confidence, Document, Limits, Options, Provenance, ReadError, ReadResult, Severity, Warning,
};
use super::sha256::sha256_hex;
use super::Reader;
use numbers::{evaluate, Eval, DECIMALS, SEPARATORS};

pub const ID: &str = "text-xy";
pub const VERSION: &str = "1";

pub const READER: Reader = Reader {
    id: ID,
    version: VERSION,
    contract: super::CONTRACT,
    detect,
    open,
};

/// Never certain: by extension and by a line of at least two numbers in the first bytes.
pub fn detect(name: &str, head: &[u8]) -> Confidence {
    let lower = name.to_ascii_lowercase();
    let ext_ok = [".csv", ".txt", ".asc", ".tsv"]
        .iter()
        .any(|e| lower.ends_with(e));
    let (text, _, _) = jtext::decode(head);
    if text.trim_start().starts_with("##") || !ext_ok {
        return Confidence::No;
    }
    let numeric = text.lines().any(|l| {
        SEPARATORS.iter().any(|&s| {
            DECIMALS
                .iter()
                .any(|&d| numbers::row(l, s, d).is_some_and(|r| r.len() >= 2))
        })
    });
    if numeric || lower.ends_with(".asc") {
        Confidence::Likely
    } else {
        Confidence::No
    }
}

/// The reading chosen for a file.
pub(crate) struct Chosen {
    pub eval: Eval,
    /// Non-blank lines `(line number, text)`.
    pub lines: Vec<(usize, String)>,
    /// `true` when the file has one value column and the axis comes from the header.
    pub y_only: bool,
}

pub fn open(bytes: &[u8], limits: &Limits, options: &Options) -> ReadResult<Document> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    let (text, fell_back, bom) = jtext::decode(bytes);
    let lines: Vec<(usize, String)> = jtext::lines(&text)
        .into_iter()
        .enumerate()
        .filter(|(_, l)| !l.trim().is_empty())
        .map(|(i, l)| (i + 1, l.trim_end().to_string()))
        .collect();
    if lines.is_empty() {
        return Err(ReadError::new("reader.text.no_data"));
    }
    let chosen = choose(lines, options)?;
    let mut warnings = Vec::new();
    if fell_back {
        warnings.push(Warning::new("reader.encoding_fallback", Severity::Caution));
    }
    if bom {
        warnings.push(Warning::new("reader.bom_removed", Severity::Info));
    }
    let built = build::document(&chosen, limits, &mut warnings)?;
    let variant = format!(
        "separator {}, decimal '{}'{}",
        numbers::sep_name(chosen.eval.sep),
        chosen.eval.decimal,
        if chosen.y_only { ", y only" } else { "" }
    );
    Ok(Document {
        spectra: built.spectra,
        primary: 0,
        fields: built.fields,
        warnings,
        provenance: Provenance {
            reader: ID,
            reader_version: VERSION,
            format: "Delimited text".to_string(),
            variant,
            sha256: sha256_hex(bytes),
            size: bytes.len(),
        },
    })
}

fn alternative(e: &Eval) -> String {
    format!("{}/{}", numbers::sep_name(e.sep), e.decimal)
}

/// Tries every combination (or only the forced ones) and decides, or refuses to guess.
fn choose(lines: Vec<(usize, String)>, options: &Options) -> ReadResult<Chosen> {
    let texts: Vec<&str> = lines.iter().map(|(_, t)| t.as_str()).collect();
    let mut evals: Vec<Eval> = Vec::new();
    for &sep in &SEPARATORS {
        for &dec in &DECIMALS {
            let sep_ok = options.separator.is_none_or(|f| Some(f) == sep);
            if !sep_ok || options.decimal.is_some_and(|f| f != dec) || sep == Some(dec) {
                continue;
            }
            evals.extend(evaluate(&texts, sep, dec));
        }
    }
    let shaped: Vec<Eval> = evals
        .into_iter()
        .filter(|e| e.shape_ok(texts.len().saturating_sub(e.first)))
        .collect();
    let (two, one): (Vec<Eval>, Vec<Eval>) = shaped.iter().cloned().partition(|e| e.columns >= 2);
    let good: Vec<&Eval> = two.iter().filter(|e| e.monotonic()).collect();
    let mut distinct: Vec<&Eval> = Vec::new();
    for e in good
        .iter()
        .copied()
        .chain(one.iter().filter(|e| e.monotonic() && !good.is_empty()))
    {
        if !distinct.iter().any(|d| d.rows == e.rows) {
            distinct.push(e);
        }
    }
    if distinct.len() > 1 {
        let alts: Vec<String> = distinct.iter().map(|e| alternative(e)).collect();
        return Err(ReadError::new("reader.text.ambiguous").with("alternatives", alts.join(", ")));
    }
    if let Some(e) = good.first() {
        return Ok(Chosen {
            eval: (*e).clone(),
            lines,
            y_only: false,
        });
    }
    if !two.is_empty() {
        return Err(ReadError::new("reader.text.not_monotonic"));
    }
    match one.first() {
        Some(e) => Ok(Chosen {
            eval: e.clone(),
            lines,
            y_only: true,
        }),
        None => Err(ReadError::new("reader.text.no_data")),
    }
}
