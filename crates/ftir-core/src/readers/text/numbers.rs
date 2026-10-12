//! Cells, separators and decimal marks of delimited text: parsing by trial of every combination.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]

/// Column separators tried, in order of preference. `None` means "no separator": one cell per line.
pub const SEPARATORS: [Option<char>; 5] = [Some('\t'), Some(';'), Some(','), Some(' '), None];
pub const DECIMALS: [char; 2] = ['.', ','];

/// Splits a line into trimmed cells (`' '` splits on runs of white space).
pub fn cells(line: &str, sep: Option<char>) -> Vec<&str> {
    match sep {
        Some(' ') => line.split_whitespace().collect(),
        Some(c) => line.split(c).map(str::trim).collect(),
        None => vec![line.trim()],
    }
}

/// A plain decimal number: `[+-]digits[mark digits][e[+-]digits]`; no thousands marks, no `inf`/`nan`.
pub fn number(cell: &str, decimal: char) -> Option<f64> {
    let b = cell.as_bytes();
    let mut i = usize::from(matches!(b.first(), Some(b'+' | b'-')));
    let int_start = i;
    while b.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    let mut digits = i - int_start;
    if b.get(i).is_some_and(|c| char::from(*c) == decimal) {
        i += 1;
        let frac_start = i;
        while b.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        digits += i - frac_start;
    }
    if digits == 0 {
        return None;
    }
    if matches!(b.get(i), Some(b'e' | b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let exp_start = i;
        while b.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == exp_start {
            return None;
        }
    }
    if i != b.len() {
        return None;
    }
    let canon = if decimal == '.' {
        cell.to_string()
    } else {
        cell.replace(decimal, ".")
    };
    canon.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// One numeric row, or `None` if any cell is not a number.
pub fn row(line: &str, sep: Option<char>, decimal: char) -> Option<Vec<f64>> {
    let cs = cells(line, sep);
    let v: Vec<f64> = cs.iter().filter_map(|c| number(c, decimal)).collect();
    (v.len() == cs.len() && !v.is_empty()).then_some(v)
}

/// How well one (separator, decimal) combination explains the data lines.
#[derive(Debug, Clone, PartialEq)]
pub struct Eval {
    pub sep: Option<char>,
    pub decimal: char,
    /// Index (in the list of non-blank lines) of the first numeric row.
    pub first: usize,
    pub columns: usize,
    /// Numeric rows with `columns` columns, in file order.
    pub rows: Vec<Vec<f64>>,
    /// Indices of the non-blank lines after `first` that are not rows of the modal width.
    pub skipped: Vec<usize>,
}

impl Eval {
    /// At least 99 % of the lines from the first row on have the modal width.
    pub fn shape_ok(&self, total_after_first: usize) -> bool {
        self.columns >= 1 && self.skipped.len() * 100 <= total_after_first
    }

    /// First column strictly monotonic (either direction).
    pub fn monotonic(&self) -> bool {
        let xs: Vec<f64> = self
            .rows
            .iter()
            .filter_map(|r| r.first().copied())
            .collect();
        xs.len() >= 2
            && (xs.windows(2).all(|w| w.first() < w.get(1))
                || xs.windows(2).all(|w| w.first() > w.get(1)))
    }
}

/// Evaluates one combination over the non-blank lines.
pub fn evaluate(lines: &[&str], sep: Option<char>, decimal: char) -> Option<Eval> {
    let parsed: Vec<Option<Vec<f64>>> = lines.iter().map(|l| row(l, sep, decimal)).collect();
    let first = parsed.iter().position(Option::is_some)?;
    let mut widths: Vec<usize> = Vec::new();
    for p in parsed.iter().skip(first).flatten() {
        widths.push(p.len());
    }
    let columns = modal(&widths)?;
    let mut rows = Vec::new();
    let mut skipped = Vec::new();
    for (i, p) in parsed.iter().enumerate().skip(first) {
        match p {
            Some(r) if r.len() == columns => rows.push(r.clone()),
            _ => skipped.push(i),
        }
    }
    Some(Eval {
        sep,
        decimal,
        first,
        columns,
        rows,
        skipped,
    })
}

/// Most frequent value; the smaller wins ties.
fn modal(v: &[usize]) -> Option<usize> {
    let mut counts: Vec<(usize, usize)> = Vec::new();
    for &w in v {
        match counts.iter_mut().find(|(k, _)| *k == w) {
            Some((_, n)) => *n += 1,
            None => counts.push((w, 1)),
        }
    }
    counts.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    counts.first().map(|(k, _)| *k)
}

pub fn sep_name(sep: Option<char>) -> &'static str {
    match sep {
        Some('\t') => "tab",
        Some(';') => "semicolon",
        Some(',') => "comma",
        Some(' ') => "space",
        _ => "none",
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn numbers() {
        assert_eq!(number("400.5", '.'), Some(400.5));
        assert_eq!(number("400,5", ','), Some(400.5));
        assert_eq!(number("-1.5e-3", '.'), Some(-0.0015));
        assert_eq!(number(".5", '.'), Some(0.5));
        assert_eq!(number("400,5", '.'), None);
        assert_eq!(number("1e", '.'), None);
        assert_eq!(number("nan", '.'), None);
        assert_eq!(number("", '.'), None);
        assert_eq!(number("1.2.3", '.'), None);
    }

    #[test]
    fn rows_and_cells() {
        assert_eq!(row("1,5;2,5", Some(';'), ','), Some(vec![1.5, 2.5]));
        assert_eq!(row("1.5 2.5  3", Some(' '), '.'), Some(vec![1.5, 2.5, 3.0]));
        assert_eq!(row("1.5;x", Some(';'), '.'), None);
    }
}
