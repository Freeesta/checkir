//! Bounds-checked little-endian reads for the binary readers: every function answers `None` instead of panicking.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::model::{Field, FieldKind};

fn array<const N: usize>(b: &[u8], at: usize) -> Option<[u8; N]> {
    b.get(at..at.checked_add(N)?)?.try_into().ok()
}

pub fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    array(b, at).map(u16::from_le_bytes)
}

pub fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    array(b, at).map(u32::from_le_bytes)
}

pub fn i16_at(b: &[u8], at: usize) -> Option<i16> {
    array(b, at).map(i16::from_le_bytes)
}

pub fn i32_at(b: &[u8], at: usize) -> Option<i32> {
    array(b, at).map(i32::from_le_bytes)
}

pub fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    array(b, at).map(f32::from_le_bytes)
}

pub fn f64_at(b: &[u8], at: usize) -> Option<f64> {
    array(b, at).map(f64::from_le_bytes)
}

/// `len` bytes starting at `at`, or `None` when the file ends first.
pub fn slice(b: &[u8], at: usize, len: usize) -> Option<&[u8]> {
    b.get(at..at.checked_add(len)?)
}

/// A `u32` field of the file as an in-memory size.
pub fn size(v: u32) -> usize {
    usize::try_from(v).unwrap_or(usize::MAX)
}

/// Text of a fixed-size field: up to the first NUL, UTF-8 when valid, otherwise Latin-1; trailing blanks removed.
pub fn text(b: &[u8]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    let raw = b.get(..end).unwrap_or_default();
    let s = match std::str::from_utf8(raw) {
        Ok(s) => s.to_string(),
        Err(_) => raw.iter().map(|&c| char::from(c)).collect(),
    };
    s.trim().to_string()
}

/// The non-empty NUL-separated texts of a block, each decoded as in [`text`].
pub fn texts(b: &[u8]) -> Vec<String> {
    b.split(|&c| c == 0)
        .map(text)
        .filter(|t| !t.is_empty())
        .collect()
}

/// A field decoded from the binary structure (`origin` says where it sits in the file).
pub fn decoded(origin: &str, key: &str, value: String, kind: FieldKind, identity: bool) -> Field {
    Field {
        origin: origin.to_string(),
        key: key.to_string(),
        original_key: key.to_string(),
        value,
        kind,
        unit: None,
        mapped: None,
        identity,
        known: true,
    }
}
