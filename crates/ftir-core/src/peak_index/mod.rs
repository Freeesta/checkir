//! Peak index of a library (`peak-index/1`): "which spectra have a band here?". Built from `peak_detect/1` run on every
//! spectrum with the same parameters; only bands with a relative prominence of at least 5 % are kept. One row is 8 bytes
//! (position ×10 as u16, prominence as u8, width class as u8, spectrum index as u32), the rows are sorted by position and
//! searched by bisection. Spectra without rows (unusable or without bands) still count, so indices match the library rows.
pub mod codec;
pub mod query;
mod search;

use crate::peaks::result::{Artifact, PeakList, Shape};
use crate::peaks::Thresholds;
use crate::spectrum::Spectrum;

pub const SCHEMA: &str = "peak-index/1";
pub const ROW_BYTES: usize = 8;
/// Bands below this relative prominence are not indexed.
pub const MIN_PROMINENCE_REL: f64 = 0.05;
/// Width classes: 0 narrow, 1 medium, 2 broad, 3 very broad. A shoulder has no width and is stored as medium.
pub const WIDTH_NAMES: [&str; 4] = ["narrow", "medium", "broad", "very_broad"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Row {
    /// Position in tenths of cm⁻¹.
    pub pos10: u16,
    /// Relative prominence × 255.
    pub prominence: u8,
    pub width: u8,
    pub spectrum: u32,
}

impl Row {
    pub fn position_cm1(&self) -> f64 {
        f64::from(self.pos10) / 10.0
    }

    pub fn prominence_rel(&self) -> f64 {
        f64::from(self.prominence) / 255.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeakIndex {
    pub chain_id: String,
    pub thresholds_version: u32,
    spectra: u32,
    rows: Vec<Row>,
}

fn width_of(shape: Option<Shape>) -> u8 {
    match shape {
        Some(Shape::Narrow) => 0,
        None | Some(Shape::Medium) => 1,
        Some(Shape::Broad) => 2,
        Some(Shape::VeryBroad) => 3,
    }
}

/// The row of a band, or `None` for CO₂/vapour artefacts and bands under the floor.
fn row_of(p: &crate::peaks::result::Peak, spectrum: u32) -> Option<Row> {
    let artifact: Option<Artifact> = p.artifact;
    if artifact.is_some() || p.prominence_rel < MIN_PROMINENCE_REL {
        return None;
    }
    Some(Row {
        pos10: (p.position_cm1 * 10.0).round().clamp(0.0, 65535.0) as u16,
        prominence: (p.prominence_rel * 255.0).round().clamp(0.0, 255.0) as u8,
        width: width_of(p.shape),
        spectrum,
    })
}

impl PeakIndex {
    pub fn new(chain_id: &str, thresholds_version: u32) -> Self {
        Self {
            chain_id: chain_id.to_string(),
            thresholds_version,
            spectra: 0,
            rows: Vec::new(),
        }
    }

    /// Builds the index of `spectra` (index = position in the slice). A spectrum the detection refuses has no rows.
    pub fn build(spectra: &[Spectrum], t: &Thresholds) -> Self {
        let mut index = Self::new(crate::peaks::CHAIN_ID, t.version);
        for s in spectra {
            index.add_spectrum(crate::peaks::detect(s, t).ok().as_ref());
        }
        index.finish();
        index
    }

    /// Adds the next spectrum (`None` = unusable) and returns how many rows it gave. Call `finish` when all are in.
    pub fn add_spectrum(&mut self, list: Option<&PeakList>) -> usize {
        let before = self.rows.len();
        let n = self.spectra;
        if let Some(list) = list {
            self.rows
                .extend(list.peaks.iter().filter_map(|p| row_of(p, n)));
        }
        self.spectra += 1;
        self.rows.len() - before
    }

    /// Sorts by position (then spectrum, strongest first): the order the bisection needs.
    pub fn finish(&mut self) {
        self.rows.sort_unstable_by_key(|r| {
            (
                r.pos10,
                r.spectrum,
                std::cmp::Reverse(r.prominence),
                r.width,
            )
        });
    }

    pub fn spectra(&self) -> u32 {
        self.spectra
    }

    pub fn rows(&self) -> &[Row] {
        &self.rows
    }

    pub(crate) fn from_parts(
        chain_id: String,
        thresholds_version: u32,
        spectra: u32,
        rows: Vec<Row>,
    ) -> Self {
        Self {
            chain_id,
            thresholds_version,
            spectra,
            rows,
        }
    }
}
