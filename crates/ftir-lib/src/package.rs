//! A package is a library in three files: `manifest.json`, `index.json`, `data.bin`. It is a cache: a package of
//! another version is rebuilt, never migrated.
use crate::data::{read_data, write_data, Limits, Matrix};
use crate::index::{index_to_json, parse_index, Row};
use crate::manifest::{Grid, Manifest};
use ftir_core::error::EngineResult;
use ftir_core::readers::sha256::sha256_hex;

/// A package read and checked.
#[derive(Debug, Clone, PartialEq)]
pub struct Package {
    pub manifest: Manifest,
    pub index: Vec<Row>,
    pub matrix: Matrix,
}

/// The three files of a package, ready to be written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Files {
    pub manifest_json: String,
    pub index_json: String,
    pub data_bin: Vec<u8>,
}

/// What the manifest says besides the numbers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub name: String,
    pub version: String,
    pub date: String,
    pub license: String,
    pub attribution_it: Option<String>,
    pub attribution_en: String,
    pub private: bool,
    /// Sampling method of the spectra; `None` = not said.
    pub sampling: Option<String>,
}

impl Package {
    /// Reads the three files and checks them: schema, counts, size, SHA-256, limits. Nothing partial is returned.
    pub fn open(
        manifest_json: &str,
        index_json: &str,
        data_bin: &[u8],
        limits: &Limits,
    ) -> EngineResult<Package> {
        let manifest = Manifest::parse(manifest_json)?;
        let index = parse_index(index_json)?;
        let matrix = read_data(&manifest, index.len(), data_bin, limits)?;
        Ok(Package {
            manifest,
            index,
            matrix,
        })
    }

    /// The values of the spectrum with this id.
    pub fn spectrum(&self, id: &str) -> Option<&[f32]> {
        let i = self.index.iter().position(|r| r.id == id)?;
        self.matrix.row(i)
    }
}

/// Builds the three files from rows already on `grid` (one `Vec<f32>` per index row, in the same order).
pub fn write_package(
    identity: &Identity,
    grid: &Grid,
    rows: Vec<(Row, Vec<f32>)>,
) -> EngineResult<Files> {
    let points = grid.points()?;
    let (index, values): (Vec<Row>, Vec<Vec<f32>>) = rows.into_iter().unzip();
    let data_bin = write_data(&values, points)?;
    let manifest = Manifest {
        name: identity.name.clone(),
        version: identity.version.clone(),
        date: identity.date.clone(),
        license: identity.license.clone(),
        attribution_it: identity.attribution_it.clone(),
        attribution_en: identity.attribution_en.clone(),
        grid: grid.clone(),
        n_spectra: index.len(),
        sha256_data: sha256_hex(&data_bin),
        private: identity.private,
        sampling: identity.sampling.clone(),
    };
    Ok(Files {
        manifest_json: manifest.to_json(),
        index_json: index_to_json(&index),
        data_bin,
    })
}
