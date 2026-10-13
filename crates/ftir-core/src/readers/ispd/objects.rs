//! Groups the pairs of the database into objects and decodes the fixed part of an object header.
use crate::readers::bdb::Pair;
use std::collections::BTreeMap;

/// Catalog keys (`AO`, `CO`, `CD`) have no object number.
pub const CATALOG: u32 = u32::MAX;

/// A pair seen as `<object> <property> <name>`.
pub struct Entry<'a> {
    pub object: u32,
    /// `<property> <name>` as written, without the object number and the final NUL.
    pub rest: String,
    /// Key as written in the file, without the final NUL.
    pub original: String,
    pub value: &'a [u8],
}

fn split_key(key: &[u8]) -> (u32, String, String) {
    let body = key.strip_suffix(&[0]).unwrap_or(key);
    let text = String::from_utf8_lossy(body).into_owned();
    if let Some((num, rest)) = text.split_once(' ') {
        if !num.is_empty() && num.len() <= 9 && num.bytes().all(|b| b.is_ascii_digit()) {
            if let Ok(n) = num.parse::<u32>() {
                return (n, rest.trim().to_string(), text.clone());
            }
        }
    }
    (CATALOG, text.trim().to_string(), text.clone())
}

/// Entries sorted by object number, then key, so that the order does not depend on the hash layout.
pub fn entries(pairs: &[Pair]) -> Vec<Entry<'_>> {
    let mut out: Vec<Entry<'_>> = pairs
        .iter()
        .map(|p| {
            let (object, rest, original) = split_key(&p.key);
            Entry {
                object,
                rest,
                original,
                value: &p.value,
            }
        })
        .collect();
    out.sort_by(|a, b| (a.object, &a.original).cmp(&(b.object, &b.original)));
    out
}

/// The properties of one object by first word.
pub fn by_object<'a, 'b>(list: &'b [Entry<'a>]) -> BTreeMap<u32, Props<'a, 'b>> {
    let mut m: BTreeMap<u32, Props<'a, 'b>> = BTreeMap::new();
    for e in list {
        if e.object != CATALOG {
            m.entry(e.object)
                .or_default()
                .entry(e.rest.as_str())
                .or_insert(e);
        }
    }
    m
}

/// The properties of one object by their full text (`100036`, `2 Description`, `0 ##MINY`).
pub type Props<'a, 'b> = BTreeMap<&'b str, &'b Entry<'a>>;

/// Offsets of the fixed part of `NON_BTREE_DATA`: Unix creation date, then length-prefixed name.
const DATE_AT: usize = 168;
const MAX_ENTRIES: u32 = 1000;

/// One line of the history of an object (who, when, what was done).
pub struct HistoryEntry {
    pub user: String,
    pub full_name: String,
    pub aux: String,
    pub unix: u32,
    pub text: String,
}

pub struct Header {
    pub created_unix: u32,
    pub name: String,
    /// `None` when the part after the name does not have the layout of a history (library imports, parameter objects).
    pub history: Option<Vec<HistoryEntry>>,
    /// True when some text was not valid UTF-8 and was read as Latin-1.
    pub latin1: bool,
}

pub fn read_u32(b: &[u8], off: usize) -> Option<u32> {
    let s = b.get(off..off.checked_add(4)?)?;
    Some(u32::from_le_bytes([
        *s.first()?,
        *s.get(1)?,
        *s.get(2)?,
        *s.get(3)?,
    ]))
}

/// Length-prefixed text; bytes below 0x20 are refused. Returns the text, the next offset and whether Latin-1 was needed.
pub fn read_text(b: &[u8], off: usize) -> Option<(String, usize, bool)> {
    let len = usize::try_from(read_u32(b, off)?).ok()?;
    if len > 4096 {
        return None;
    }
    let start = off.checked_add(4)?;
    let end = start.checked_add(len)?;
    let raw = b.get(start..end)?;
    if raw.iter().any(|&c| c < 0x20) {
        return None;
    }
    match std::str::from_utf8(raw) {
        Ok(t) => Some((t.to_string(), end, false)),
        Err(_) => Some((raw.iter().map(|&c| char::from(c)).collect(), end, true)),
    }
}

fn history(value: &[u8], at: usize, latin1: &mut bool) -> Option<Vec<HistoryEntry>> {
    let kind = read_u32(value, at.checked_add(4)?)?;
    let size = usize::try_from(read_u32(value, at.checked_add(8)?)?).ok()?;
    let count = read_u32(value, at.checked_add(12)?)?;
    let body = at.checked_add(12)?;
    if kind != 9 || count > MAX_ENTRIES || value.len().checked_sub(body)? != size {
        return None;
    }
    let mut p = at.checked_add(16)?;
    let mut out = Vec::new();
    for _ in 0..count {
        let (user, q, a) = read_text(value, p)?;
        let (full_name, q, b) = read_text(value, q)?;
        let (aux, q, c) = read_text(value, q)?;
        let unix = read_u32(value, q)?;
        let (text, q, d) = read_text(value, q.checked_add(4)?)?;
        *latin1 |= a | b | c | d;
        p = q;
        out.push(HistoryEntry {
            user,
            full_name,
            aux,
            unix,
            text,
        });
    }
    (p == value.len()).then_some(out)
}

pub fn header(value: &[u8]) -> Option<Header> {
    let created_unix = read_u32(value, DATE_AT)?;
    let (name, after, mut latin1) = read_text(value, DATE_AT + 4)?;
    let history = history(value, after, &mut latin1);
    Some(Header {
        created_unix,
        name,
        history,
        latin1,
    })
}

/// ISO 8601 UTC from a Unix time (days-to-civil algorithm).
pub fn iso_utc(unix: u32) -> String {
    let secs = i64::from(unix);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::indexing_slicing)]
mod test {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_utc(1_000_000_000), "2001-09-09T01:46:40Z");
        assert_eq!(iso_utc(1_781_000_000), "2026-06-09T10:13:20Z");
    }

    #[test]
    fn keys() {
        let (n, rest, _) = split_key(b"12 100036 \0");
        assert_eq!((n, rest.as_str()), (12, "100036"));
        let (n, rest, _) = split_key(b"AO\0");
        assert_eq!((n, rest.as_str()), (CATALOG, "AO"));
        let (n, rest, _) = split_key(b"3 MEMBERS\0");
        assert_eq!((n, rest.as_str()), (3, "MEMBERS"));
    }
}
