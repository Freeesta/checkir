//! Decoding of `(X++(Y..Y))` tables: AFFN, PAC and the ASDF compressions SQZ, DIF and DUP with the Y check.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use crate::readers::model::{ReadError, ReadResult};

#[derive(Debug, Clone, Copy, PartialEq)]
enum Tok {
    /// AFFN, PAC or SQZ number: an absolute value.
    Abs(f64),
    Dif(f64),
    Dup(usize),
}

/// The abscissa of one table line and the index of the point it belongs to (in DIF lines, the check point).
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub line: usize,
    pub x: f64,
    pub start: usize,
}

/// A failed Y check: the first Y of `line` should repeat the last Y of the previous DIF line.
#[derive(Debug, Clone, PartialEq)]
pub struct CheckFailure {
    pub line: usize,
    pub expected: f64,
    pub found: f64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Decoded {
    pub rows: Vec<Row>,
    /// Raw (not multiplied by `YFACTOR`) ordinates.
    pub y: Vec<f64>,
    pub check_failures: Vec<CheckFailure>,
    /// Counts of lines that used the compressed forms (for the format variant).
    pub forms: Forms,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Forms {
    pub sqz: bool,
    pub dif: bool,
    pub dup: bool,
    pub pac: bool,
}

fn bad(line: usize) -> ReadError {
    ReadError::new("reader.jcamp.bad_data").with("line", line)
}

fn digit_of(c: u8, base: u8) -> usize {
    usize::from(c.wrapping_sub(base))
}

/// Reads an unsigned decimal string starting at `i`; returns the end index.
fn digits_end(b: &[u8], mut i: usize) -> usize {
    while b.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    i
}

/// `exponent` is false for the abscissa: a compressed line may continue with the SQZ digit `E` right after it.
fn plain_number(b: &[u8], start: usize, line: usize, exponent: bool) -> ReadResult<(f64, usize)> {
    let mut i = start;
    if matches!(b.get(i), Some(b'+' | b'-')) {
        i += 1;
    }
    i = digits_end(b, i);
    if b.get(i) == Some(&b'.') {
        i = digits_end(b, i + 1);
    }
    if exponent && matches!(b.get(i), Some(b'E' | b'e')) {
        let mut j = i + 1;
        if matches!(b.get(j), Some(b'+' | b'-')) {
            j += 1;
        }
        if b.get(j).is_some_and(u8::is_ascii_digit) {
            i = digits_end(b, j);
        }
    }
    let text = b.get(start..i).and_then(|s| std::str::from_utf8(s).ok());
    let v = text
        .and_then(|t| t.parse::<f64>().ok())
        .filter(|v| v.is_finite());
    v.map(|v| (v, i)).ok_or_else(|| bad(line))
}

/// Number made of a leading code digit (given by the letter) followed by plain digits.
fn coded_text(b: &[u8], i: usize, lead: usize) -> (String, usize) {
    let end = digits_end(b, i + 1);
    let tail = b.get(i + 1..end).and_then(|s| std::str::from_utf8(s).ok());
    (format!("{lead}{}", tail.unwrap_or("")), end)
}

fn coded_number(b: &[u8], i: usize, lead: usize, line: usize) -> ReadResult<(f64, usize)> {
    let (text, end) = coded_text(b, i, lead);
    let v = text.parse::<f64>().map_err(|_| bad(line))?;
    Ok((v, end))
}

fn tokenize(line_text: &str, line: usize, forms: &mut Forms) -> ReadResult<Vec<Tok>> {
    let b = line_text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0usize;
    while let Some(&c) = b.get(i) {
        match c {
            b' ' | b'\t' | b',' => i += 1,
            b'+' | b'-' | b'0'..=b'9' | b'.' => {
                if matches!(c, b'+' | b'-')
                    && i > 0
                    && !matches!(b.get(i - 1), Some(b' ' | b'\t' | b','))
                {
                    forms.pac = true;
                }
                let (v, end) = plain_number(b, i, line, !out.is_empty())?;
                out.push(Tok::Abs(v));
                i = end;
            }
            b'@' | b'A'..=b'I' | b'a'..=b'i' => {
                forms.sqz = true;
                let (neg, lead) = if c == b'@' {
                    (false, 0)
                } else if c.is_ascii_uppercase() {
                    (false, digit_of(c, b'A') + 1)
                } else {
                    (true, digit_of(c, b'a') + 1)
                };
                let (v, end) = coded_number(b, i, lead, line)?;
                out.push(Tok::Abs(if neg { -v } else { v }));
                i = end;
            }
            b'%' | b'J'..=b'R' | b'j'..=b'r' => {
                forms.dif = true;
                let (neg, lead) = if c == b'%' {
                    (false, 0)
                } else if c.is_ascii_uppercase() {
                    (false, digit_of(c, b'J') + 1)
                } else {
                    (true, digit_of(c, b'j') + 1)
                };
                let (v, end) = coded_number(b, i, lead, line)?;
                out.push(Tok::Dif(if neg { -v } else { v }));
                i = end;
            }
            b'S'..=b'Z' | b's' => {
                forms.dup = true;
                let lead = if c == b's' { 9 } else { digit_of(c, b'S') + 1 };
                let (text, end) = coded_text(b, i, lead);
                // Saturating conversion: an absurd count is caught by the point limit.
                out.push(Tok::Dup(text.parse::<usize>().unwrap_or(usize::MAX)));
                i = end;
            }
            _ => return Err(bad(line)),
        }
    }
    Ok(out)
}

fn same(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-9 * a.abs().max(b.abs()).max(1.0)
}

/// Decodes the lines of one `(X++(Y..Y))` table. `max_points` bounds the number of ordinates.
pub fn decode_xydata(body: &[(usize, String)], max_points: usize) -> ReadResult<Decoded> {
    let mut d = Decoded::default();
    let mut prev_ends_dif = false;
    for (line, text) in body {
        let toks = tokenize(text, *line, &mut d.forms)?;
        let mut it = toks.into_iter();
        let x = match it.next() {
            Some(Tok::Abs(x)) => x,
            _ => return Err(bad(*line)),
        };
        let start = d.y.len();
        let mut row: Vec<f64> = Vec::new();
        let mut last: Option<Tok> = None;
        let mut ends_dif = false;
        let mut checked = false;
        for (k, t) in it.enumerate() {
            let mut t = t;
            if let (0, true, Tok::Abs(v), Some(&prev)) = (k, prev_ends_dif, t, d.y.last()) {
                if !same(v, prev) {
                    d.check_failures.push(CheckFailure {
                        line: *line,
                        expected: prev,
                        found: v,
                    });
                }
                t = Tok::Abs(prev);
                checked = true;
            }
            ends_dif = push_token(&mut row, &mut last, t, max_points, *line)?;
        }
        if checked {
            row.remove(0);
        }
        if d.y.len() + row.len() > max_points {
            return Err(ReadError::limit("points", max_points));
        }
        d.rows.push(Row {
            line: *line,
            x,
            start: if checked {
                start.saturating_sub(1)
            } else {
                start
            },
        });
        d.y.extend(row);
        prev_ends_dif = ends_dif;
    }
    Ok(d)
}

/// Applies one token to the ordinates of the current line; returns whether the line now ends in DIF form.
fn push_token(
    row: &mut Vec<f64>,
    last: &mut Option<Tok>,
    t: Tok,
    max_points: usize,
    line: usize,
) -> ReadResult<bool> {
    let reps = match t {
        Tok::Dup(n) => n.saturating_sub(1),
        _ => 1,
    };
    if reps > max_points || row.len() + reps > max_points {
        return Err(ReadError::limit("points", max_points));
    }
    let effective = match t {
        Tok::Dup(_) => last.ok_or_else(|| bad(line))?,
        other => other,
    };
    for _ in 0..reps {
        match effective {
            Tok::Abs(v) => row.push(v),
            Tok::Dif(d) => {
                let prev = row.last().copied().ok_or_else(|| bad(line))?;
                row.push(prev + d);
            }
            Tok::Dup(_) => return Err(bad(line)),
        }
    }
    *last = Some(effective);
    Ok(matches!(effective, Tok::Dif(_)))
}

#[cfg(test)]
mod test {
    use super::*;

    fn body(lines: &[&str]) -> Vec<(usize, String)> {
        lines
            .iter()
            .enumerate()
            .map(|(i, l)| (i + 1, l.to_string()))
            .collect()
    }

    #[test]
    fn affn_and_pac() {
        let d = decode_xydata(&body(&["400 1 2 3", "3997+65450354-5"]), 100).unwrap_or_default();
        assert_eq!(d.y, vec![1.0, 2.0, 3.0, 65450354.0, -5.0]);
        assert_eq!(d.rows.len(), 2);
        assert!(d.forms.pac);
    }

    #[test]
    fn sqz_dif_dup_with_check() {
        // A0=10, B2=22, J3 = +13, T repeats it once; the next line starts with the check value D8=48.
        let d = decode_xydata(&body(&["0 A0B2J3T", "5 D8K1"]), 100).unwrap_or_default();
        assert!(d.forms.sqz && d.forms.dif && d.forms.dup);
        assert_eq!(d.y, vec![10.0, 22.0, 35.0, 48.0, 69.0]);
        assert!(d.check_failures.is_empty());
    }

    #[test]
    fn wrong_check_is_reported() {
        let d = decode_xydata(&body(&["0 A0J2", "2 B0K1"]), 100).unwrap_or_default();
        assert_eq!(d.check_failures.len(), 1);
        assert_eq!(d.y, vec![10.0, 22.0, 43.0]);
    }

    #[test]
    fn exponent_and_garbage() {
        let d = decode_xydata(&body(&["1 1.5E+3 2E-1"]), 100).unwrap_or_default();
        assert_eq!(d.y, vec![1500.0, 0.2]);
        assert!(decode_xydata(&body(&["1 ?"]), 100).is_err());
        assert!(decode_xydata(&body(&["1 S9999999999999"]), 100).is_err());
    }
}
