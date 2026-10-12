//! Text layer of JCAMP-DX: decoding, line splitting and labelled data records (LDR).
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use crate::readers::model::{Limits, ReadError, ReadResult};

/// Labels whose body is a numeric table (moved to the spectrum, not copied into the field).
pub const DATA_LABELS: [&str; 4] = ["XYDATA", "XYPOINTS", "PEAKTABLE", "DATATABLE"];

/// One `##LABEL=value` record with its continuation lines (comments already removed).
#[derive(Debug, Clone, PartialEq)]
pub struct Ldr {
    pub line: usize,
    pub raw_label: String,
    pub label: String,
    pub value: String,
    pub cont: Vec<(usize, String)>,
}

impl Ldr {
    pub fn is_data(&self) -> bool {
        DATA_LABELS.contains(&self.label.as_str())
    }

    /// Value with its continuation lines joined by `\n` (data tables keep only the first line).
    pub fn full_value(&self) -> String {
        let mut s = self.value.clone();
        if !self.is_data() {
            for (_, c) in &self.cont {
                s.push('\n');
                s.push_str(c);
            }
        }
        s
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Item {
    Ldr(Ldr),
    /// A `$$` comment (the text after the marker).
    Comment {
        line: usize,
        text: String,
    },
    /// Text outside any record.
    Stray {
        line: usize,
        text: String,
    },
}

/// Decodes UTF-8 (BOM removed) or, when that fails, Windows-1252. Returns `(text, fell_back, had_bom)`.
pub fn decode(bytes: &[u8]) -> (String, bool, bool) {
    let (body, bom) = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(b) => (b, true),
        None => (bytes, false),
    };
    match std::str::from_utf8(body) {
        Ok(s) => (s.to_string(), false, bom),
        Err(_) => (body.iter().map(|&b| cp1252(b)).collect(), true, bom),
    }
}

fn cp1252(b: u8) -> char {
    const HIGH: [u32; 32] = [
        0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
        0x2039, 0x0152, 0x8D, 0x017D, 0x8F, 0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013,
        0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178,
    ];
    if (0x80..0xA0).contains(&b) {
        let code = HIGH
            .get(usize::from(b) - 0x80)
            .copied()
            .unwrap_or(u32::from(b));
        char::from_u32(code).unwrap_or('\u{FFFD}')
    } else {
        char::from(b)
    }
}

/// Splits on CRLF, LF or CR.
pub fn lines(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        match rest.find(['\r', '\n']) {
            Some(p) => {
                out.push(rest.get(..p).unwrap_or(""));
                let tail = rest.get(p..).unwrap_or("");
                let skip = if tail.starts_with("\r\n") { 2 } else { 1 };
                rest = tail.get(skip..).unwrap_or("");
            }
            None => {
                out.push(rest);
                rest = "";
            }
        }
    }
    out
}

/// Label normalisation: upper case, without spaces, `-`, `/`, `_`.
pub fn normalize(label: &str) -> String {
    label
        .chars()
        .filter(|c| !matches!(c, ' ' | '\t' | '-' | '/' | '_'))
        .flat_map(char::to_uppercase)
        .collect()
}

/// Scans the whole text into records, comments and stray lines.
pub fn scan(text: &str, limits: &Limits) -> ReadResult<Vec<Item>> {
    let mut items: Vec<Item> = Vec::new();
    let mut header_lines = 0usize;
    let mut open: Option<Ldr> = None;
    let mut pending: Vec<Item> = Vec::new();
    for (idx, raw) in lines(text).into_iter().enumerate() {
        let line = idx + 1;
        let (body, comment) = match raw.find("$$") {
            Some(p) => (raw.get(..p).unwrap_or(""), raw.get(p + 2..)),
            None => (raw, None),
        };
        if body.trim_start().starts_with("##") {
            close(&mut items, &mut open, &mut pending);
            open = Some(start_record(line, body.trim_start()));
            header_lines += 1;
        } else if !body.trim().is_empty() {
            match open.as_mut() {
                Some(r) => {
                    if !r.is_data() {
                        header_lines += 1;
                    }
                    r.cont.push((line, body.trim_end().to_string()));
                }
                None => {
                    items.push(Item::Stray {
                        line,
                        text: body.trim().to_string(),
                    });
                    header_lines += 1;
                }
            }
        }
        if let Some(c) = comment {
            pending.push(Item::Comment {
                line,
                text: c.trim().to_string(),
            });
            header_lines += 1;
            if open.is_none() {
                close(&mut items, &mut open, &mut pending);
            }
        }
        if header_lines > limits.max_header_lines {
            return Err(ReadError::limit("header_lines", limits.max_header_lines));
        }
        if let Some(r) = &open {
            let len: usize = r.value.len() + r.cont.iter().map(|(_, c)| c.len()).sum::<usize>();
            if !r.is_data() && len > limits.max_value_len {
                return Err(ReadError::limit("value_length", limits.max_value_len));
            }
        }
    }
    close(&mut items, &mut open, &mut pending);
    Ok(items)
}

/// Pushes the open record, then the comments met while it was open (file order of the records is kept).
fn close(items: &mut Vec<Item>, open: &mut Option<Ldr>, pending: &mut Vec<Item>) {
    if let Some(done) = open.take() {
        items.push(Item::Ldr(done));
    }
    items.append(pending);
}

fn start_record(line: usize, body: &str) -> Ldr {
    let rest = body.get(2..).unwrap_or("");
    let (raw_label, value) = match rest.split_once('=') {
        Some((l, v)) => (l.trim(), v.trim()),
        None => (rest.trim(), ""),
    };
    Ldr {
        line,
        raw_label: raw_label.to_string(),
        label: normalize(raw_label),
        value: value.to_string(),
        cont: Vec::new(),
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn decodes_with_fallback() {
        assert_eq!(decode("a±".as_bytes()), ("a±".to_string(), false, false));
        assert_eq!(decode(b"a\xB1"), ("a±".to_string(), true, false));
        assert_eq!(decode(b"\xEF\xBB\xBFx"), ("x".to_string(), false, true));
    }

    #[test]
    fn labels_and_comments() {
        let t = "##JCAMP-DX=5.01  $$ Nicolet\r\n##SAMPLING PROCEDURE=a\r\nmore\r\n##END=";
        let items = scan(t, &Limits::STANDARD).unwrap_or_default();
        assert_eq!(items.len(), 4);
        match items.first() {
            Some(Item::Ldr(l)) => {
                assert_eq!((l.label.as_str(), l.value.as_str()), ("JCAMPDX", "5.01"));
            }
            _ => panic!("first item"),
        }
        assert!(matches!(items.get(1), Some(Item::Comment { text, .. }) if text == "Nicolet"));
        match items.get(2) {
            Some(Item::Ldr(l)) => assert_eq!(l.full_value(), "a\nmore"),
            _ => panic!("third item"),
        }
    }
}
