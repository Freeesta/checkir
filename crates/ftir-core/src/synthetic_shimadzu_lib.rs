//! Synthetic Shimadzu library (`.L01` + `.nam`) generator with the truth, for the reader tests (no real data).
use crate::synthetic_ispd::{write_hash, Pairs};

/// One synthetic entry: its name and the `n` bytes it holds (the instrument's 0..255 normalised absorbance).
pub struct Entry {
    pub name: String,
    pub values: Vec<u8>,
}

/// Axis of the synthetic library: 4000..600 cm-1, step 4 (n = 851).
pub const HIGH: f64 = 4000.0;
pub const LOW: f64 = 600.0;
pub const STEP: f64 = 4.0;

pub fn points() -> usize {
    ((HIGH - LOW) / STEP) as usize + 1
}

/// `count` entries, each a Gaussian band whose centre moves with the entry number; the peak is 255 (normalised).
pub fn entries(count: usize) -> Vec<Entry> {
    let n = points();
    (0..count)
        .map(|k| {
            let centre = 800.0 + 150.0 * k as f64;
            let values = (0..n)
                .map(|i| {
                    let x = LOW + STEP * i as f64;
                    let g = (-((x - centre) / 30.0).powi(2)).exp();
                    (255.0 * g).round() as u8
                })
                .collect();
            Entry {
                name: format!("Substance {}", k + 1),
                values,
            }
        })
        .collect()
}

/// The `.L01` file: 72-byte header (`IRS`, high, low, step), then per entry 40 bytes of its own and the data.
pub fn l01(entries: &[Entry]) -> Vec<u8> {
    let mut out = vec![0u8; 72];
    if let Some(s) = out.get_mut(..4) {
        s.copy_from_slice(b"IRS\0");
    }
    for (at, v) in [(8, HIGH), (16, LOW), (24, STEP)] {
        if let Some(s) = out.get_mut(at..at + 8) {
            s.copy_from_slice(&v.to_le_bytes());
        }
    }
    for e in entries {
        out.extend_from_slice(&[0u8; 40]);
        out.extend_from_slice(&e.values);
    }
    out
}

/// The `.nam` file: a Berkeley DB hash with `"1 <k> NAME"` -> name and `"2 <k> DESCRIPTION"` -> text per entry.
pub fn nam(entries: &[Entry]) -> Vec<u8> {
    let mut pairs: Pairs = Vec::new();
    for (k, e) in entries.iter().enumerate() {
        pairs.push((
            format!("1 {} NAME\0", k + 1).into_bytes(),
            e.name.clone().into_bytes(),
        ));
        pairs.push((
            format!("2 {} DESCRIPTION\0", k + 1).into_bytes(),
            format!("CAS: synthetic {}", k + 1).into_bytes(),
        ));
    }
    write_hash(&pairs, 512)
}
