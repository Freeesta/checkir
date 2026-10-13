//! `data.bin`: the spectra back to back as float32 little-endian on the common grid, in the order of the index.
//! An absent point (outside the measured range) is a NaN and keeps its bits.
use crate::manifest::Manifest;
use ftir_core::error::{EngineError, EngineResult};
use ftir_core::readers::sha256::sha256_hex;

/// Size limits checked before anything is allocated or hashed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub max_bytes: usize,
    pub max_spectra: usize,
}

impl Limits {
    /// 256 MiB of data (about 40 000 spectra on the standard grid) and 50 000 spectra.
    pub const STANDARD: Limits = Limits {
        max_bytes: 256 * 1024 * 1024,
        max_spectra: 50_000,
    };
}

/// The matrix of a package: `rows` spectra of `points` values each, row-major.
#[derive(Debug, Clone, PartialEq)]
pub struct Matrix {
    pub points: usize,
    pub values: Vec<f32>,
}

impl Matrix {
    pub fn rows(&self) -> usize {
        self.values.len().checked_div(self.points).unwrap_or(0)
    }

    /// The `i`-th spectrum.
    pub fn row(&self, i: usize) -> Option<&[f32]> {
        let start = i.checked_mul(self.points)?;
        self.values.get(start..start.checked_add(self.points)?)
    }
}

/// The bytes of `data.bin`; every row must have exactly `points` values.
pub fn write_data(rows: &[Vec<f32>], points: usize) -> EngineResult<Vec<u8>> {
    let mut out = Vec::with_capacity(rows.len().saturating_mul(points).saturating_mul(4));
    for (i, row) in rows.iter().enumerate() {
        if row.len() != points {
            return Err(
                EngineError::new("library.row_length", "a row has the wrong length")
                    .with_param("row", i)
                    .with_param("expected", points)
                    .with_param("found", row.len()),
            );
        }
        out.extend(row.iter().flat_map(|v| v.to_le_bytes()));
    }
    Ok(out)
}

/// Checks `bytes` against the manifest (limits, count, size, SHA-256) and decodes them.
/// `index_len` is the number of index rows. A byte changed anywhere is `library.sha256_mismatch`.
pub fn read_data(
    manifest: &Manifest,
    index_len: usize,
    bytes: &[u8],
    limits: &Limits,
) -> EngineResult<Matrix> {
    if manifest.n_spectra > limits.max_spectra {
        return Err(
            EngineError::new("library.too_many_spectra", "too many spectra")
                .with_param("n", manifest.n_spectra)
                .with_param("max", limits.max_spectra),
        );
    }
    if bytes.len() > limits.max_bytes {
        return Err(
            EngineError::new("library.too_large", "the data is too large")
                .with_param("bytes", bytes.len())
                .with_param("max", limits.max_bytes),
        );
    }
    if index_len != manifest.n_spectra {
        return Err(
            EngineError::new("library.count_mismatch", "manifest and index disagree")
                .with_param("manifest", manifest.n_spectra)
                .with_param("index", index_len),
        );
    }
    let points = manifest.grid.points()?;
    let expected = manifest.n_spectra.saturating_mul(points).saturating_mul(4);
    if bytes.len() != expected {
        return Err(
            EngineError::new("library.size_mismatch", "the data has the wrong size")
                .with_param("expected", expected)
                .with_param("found", bytes.len()),
        );
    }
    if sha256_hex(bytes) != manifest.sha256_data {
        return Err(EngineError::new(
            "library.sha256_mismatch",
            "the data does not match its SHA-256",
        )
        .with_param("name", &manifest.name)
        .with_param("version", &manifest.version));
    }
    let values = bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    Ok(Matrix { points, values })
}
