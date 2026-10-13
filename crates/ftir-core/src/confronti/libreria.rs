//! A library prepared for the search: one row per spectrum, in two matrices (derivative and AsLS spectrum), each row
//! centred and scaled to norm 1 over its own present points, stored as f32 in one contiguous buffer. The dot product of
//! two full rows is their Pearson r. The cache is rebuilt, never migrated, when `CACHE_VERSION` or the chain changes.
use super::{masked, prepare, GRID_N};
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// What the page knows about a spectrum of the library. `substance` is the identity (same substance, any form);
/// without it (and without `inchikey`) the search groups by the normalised `display_name` and says so in the result.
#[derive(Debug, Clone, PartialEq)]
pub struct LibEntry {
    pub id: String,
    pub substance: Option<String>,
    /// InChIKey of the compound; two rows with the same one are the same substance even under different names.
    pub inchikey: Option<String>,
    pub display_name: String,
    pub form: String,
    /// Class ids of the substance (`classes.json`); the flagged-family alert reads them.
    pub classes: Vec<String>,
}

/// Rows of `GRID_N` values plus presence flags (1 = the point exists) and a "full" flag per row
/// (present at every point outside the mask: the fast path of the search).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Matrix {
    pub data: Vec<f32>,
    pub present: Vec<u8>,
    pub full: Vec<bool>,
}

impl Matrix {
    pub fn rows(&self) -> usize {
        self.full.len()
    }

    pub fn row(&self, i: usize) -> &[f32] {
        &self.data[i * GRID_N..(i + 1) * GRID_N]
    }

    pub fn presence(&self, i: usize) -> &[u8] {
        &self.present[i * GRID_N..(i + 1) * GRID_N]
    }

    /// Append the vector `v` (`NaN` = absent) centred and scaled over its finite points; a constant vector is stored as
    /// all-absent (it can never correlate).
    pub fn push(&mut self, v: &[f64]) {
        let finite: Vec<f64> = v.iter().copied().filter(|x| x.is_finite()).collect();
        let mean = finite.iter().sum::<f64>() / finite.len().max(1) as f64;
        let norm = finite
            .iter()
            .map(|x| (x - mean) * (x - mean))
            .sum::<f64>()
            .sqrt();
        let usable = finite.len() >= 3 && norm > 1e-300;
        let keep = |x: &f64| usable && x.is_finite();
        self.data.extend(v.iter().map(|x| {
            if keep(x) {
                ((x - mean) / norm) as f32
            } else {
                0.0
            }
        }));
        self.present.extend(v.iter().map(|x| u8::from(keep(x))));
        self.full.push(
            usable
                && v.iter()
                    .enumerate()
                    .all(|(i, x)| masked(i) || x.is_finite()),
        );
    }
}

/// A prepared library: id, version, entries and the two matrices.
#[derive(Debug, Clone, PartialEq)]
pub struct LibraryCache {
    pub id: String,
    pub version: String,
    /// Sampling method of the reference spectra (`ATR`, `transmission`, ...), when the library says it.
    pub sampling: Option<String>,
    pub entries: Vec<LibEntry>,
    pub deriv: Matrix,
    pub spec: Matrix,
}

impl LibraryCache {
    pub fn new(id: &str, version: &str) -> Self {
        Self {
            id: id.to_string(),
            version: version.to_string(),
            sampling: None,
            entries: Vec::new(),
            deriv: Matrix::default(),
            spec: Matrix::default(),
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Prepare `s` and append it. On error nothing is added (the caller decides whether to skip the spectrum).
    pub fn add(&mut self, entry: LibEntry, s: &Spectrum) -> EngineResult<()> {
        let p = prepare(s).map_err(|e| e.with_param("spettro", &entry.id))?;
        self.deriv.push(&p.deriv);
        self.spec.push(&p.spec);
        self.entries.push(entry);
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn rows_are_centred_unit_vectors_and_absent_points_are_zero() {
        let mut m = Matrix::default();
        let mut v: Vec<f64> = (0..GRID_N).map(|i| (i as f64 * 0.05).sin() + 2.0).collect();
        v[0] = f64::NAN;
        m.push(&v);
        let sum: f32 = m.row(0).iter().sum();
        let sq: f32 = m.row(0).iter().map(|x| x * x).sum();
        assert!(sum.abs() < 1e-3 && (sq - 1.0).abs() < 1e-4, "{sum} {sq}");
        assert_eq!((m.row(0)[0], m.presence(0)[0], m.full[0]), (0.0, 0, false));
    }

    #[test]
    fn a_constant_vector_is_stored_empty() {
        let mut m = Matrix::default();
        m.push(&vec![1.0; GRID_N]);
        assert!(m.presence(0).iter().all(|p| *p == 0) && !m.full[0]);
    }
}
