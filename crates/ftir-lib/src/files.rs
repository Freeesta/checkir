//! A private library from the bytes of files of any format a reader of the registry recognises: the same rules as the
//! page's import (`web/importa.js`): one row per file, `substance` = slug of the file name, a file whose SHA-256 was
//! already seen is dropped, files no reader recognises are counted apart, any other failure is listed and skipped.
use crate::bridge::{native_standard_file, resample_standard_file};
use crate::index::Row;
use ftir_core::readers::sha256::sha256_hex;
use std::collections::HashSet;

/// The result of reading a set of files.
#[derive(Debug, Default)]
pub struct Imported {
    /// One row and its values on the standard grid per spectrum, ids `u1`, `u2`, … in input order.
    pub rows: Vec<(Row, Vec<f32>)>,
    /// `native.bin` content: the spectra as the files give them, in row order.
    pub native: Vec<u8>,
    /// Files no reader recognises.
    pub unrecognized: usize,
    /// Files with the same content as one already read.
    pub repeated: usize,
    /// `(file name, error key)` of the files that failed for any other reason.
    pub skipped: Vec<(String, String)>,
}

/// A name as an id: lower case letters, digits and single dashes (`library` when nothing is left).
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars().flat_map(char::to_lowercase) {
        let c = match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => 'a',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-');
    if out.is_empty() {
        "library".into()
    } else {
        out.into()
    }
}

/// The file name without its last extension: the name of the compound.
fn title_of(file: &str) -> String {
    let name = file.rsplit(['/', '\\']).next().unwrap_or(file);
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => name.to_string(),
    }
}

/// Reads `files` (name, bytes) in the given order.
pub fn from_files(files: &[(String, Vec<u8>)]) -> Imported {
    let mut out = Imported::default();
    let mut seen = HashSet::new();
    for (name, bytes) in files {
        if !seen.insert(sha256_hex(bytes)) {
            out.repeated += 1;
            continue;
        }
        let read = resample_standard_file(name, bytes)
            .and_then(|v| Ok((v, native_standard_file(name, bytes)?)));
        match read {
            Ok((values, native)) => {
                let title = title_of(name);
                let row = Row {
                    id: format!("u{}", out.rows.len() + 1),
                    form: String::new(),
                    substance: Some(slug(&title)),
                    name_it: None,
                    name_en: title,
                    classes: Vec::new(),
                    inchikey: None,
                    quality: "pass".into(),
                    provenance_type: "user_import".into(),
                };
                out.native
                    .extend(native.iter().flat_map(|v| v.to_le_bytes()));
                out.rows.push((row, values));
            }
            Err(e) if e.error_key == "reader.unknown_format" => out.unrecognized += 1,
            Err(e) => out.skipped.push((name.clone(), e.error_key.to_string())),
        }
    }
    out
}
