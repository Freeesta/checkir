//! The state the page keeps between calls: libraries being loaded or loaded, the index over them and the thresholds.
//! The wasm bridge holds one `Motore` and forwards; all the logic stays here.
use super::cache_bytes::{library_from_bytes, library_to_bytes, twins_from_bytes, twins_to_bytes};
use super::cerca::search_with;
use super::indice::{Index, TWIN_BLOCK};
use super::lettori::from_reader;
use super::libreria::{LibEntry, LibraryCache};
use super::opzioni::{parse_options, parse_query};
use super::prepare;
use super::prova::{Prova, PROVA_BLOCK};
use super::prova_rapporto;
use super::soglie::Thresholds;
use crate::error::{EngineError, EngineResult};
use crate::passi::json::Value;
use crate::readers::{
    self,
    model::{Limits, Options},
};
use crate::spectrum::{Role, Spectrum};

impl Session {
    /// Register the sample `id` (derivative vector `deriv`) and give back the derivative of the sample before it.
    /// The same id again (the chemist changes ranges or libraries) keeps the sample before it.
    fn previous_for(&mut self, id: &str, deriv: Vec<f64>) -> Option<&[f64]> {
        if self.current.as_ref().is_none_or(|(c, _)| c != id) {
            self.previous = self.current.take().map(|(_, d)| d);
            self.current = Some((id.to_string(), deriv));
        }
        self.previous.as_deref()
    }
}

impl Motore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Give the libraries back from the index (it is rebuilt, twins included, when next needed).
    fn release(&mut self) {
        if let Some(i) = self.index.take() {
            self.libraries = i.libs;
        }
    }

    fn position(&mut self, id: &str) -> EngineResult<usize> {
        self.release();
        self.libraries
            .iter()
            .position(|l| l.id == id)
            .ok_or_else(|| unknown(id))
    }

    /// Start a library (replaces a loaded one with the same id). Spectra follow with `add`.
    pub fn begin(&mut self, id: &str, version: &str) {
        self.release();
        self.libraries.retain(|l| l.id != id);
        self.libraries.push(LibraryCache::new(id, version));
    }

    /// Prepare and append one spectrum to the library `lib`.
    pub fn add(&mut self, lib: &str, entry: LibEntry, s: &Spectrum) -> EngineResult<()> {
        let i = self.position(lib)?;
        self.libraries[i].add(entry, s)
    }

    /// Read `bytes` (a library file: JCAMP-DX, text) with the reader registry and append its main spectrum.
    pub fn add_file(
        &mut self,
        lib: &str,
        entry: LibEntry,
        name: &str,
        bytes: &[u8],
        limits: &Limits,
    ) -> EngineResult<()> {
        let head = bytes.get(..bytes.len().min(4096)).unwrap_or_default();
        let reader = readers::pick(name, head)
            .ok_or_else(|| EngineError::new("reader.unknown_format", "unknown file format"))?;
        let doc = (reader.open)(bytes, limits, &Options::default()).map_err(EngineError::from)?;
        let main = doc.spectra.get(doc.primary).ok_or_else(|| {
            EngineError::new(
                "confronti.spettro_non_utilizzabile",
                "the file has no spectrum",
            )
        })?;
        self.add(lib, entry, &from_reader(main)?)
    }

    /// Put a library saved by `export` back (replaces one with the same id).
    pub fn import(&mut self, bytes: &[u8]) -> EngineResult<()> {
        let l = library_from_bytes(bytes)?;
        self.release();
        self.libraries.retain(|x| x.id != l.id);
        self.libraries.push(l);
        Ok(())
    }

    pub fn export(&mut self, lib: &str) -> EngineResult<Vec<u8>> {
        let i = self.position(lib)?;
        Ok(library_to_bytes(&self.libraries[i]))
    }

    pub fn remove(&mut self, lib: &str) {
        self.release();
        self.libraries.retain(|l| l.id != lib);
    }

    /// The index over the loaded libraries, built when needed (twins start from scratch).
    fn index(&mut self) -> &mut Index {
        let libs = &mut self.libraries;
        self.index
            .get_or_insert_with(|| Index::new(std::mem::take(libs)))
    }

    /// Compute the next block of twins; returns `(done, total)`.
    pub fn twins_step(&mut self) -> (usize, usize) {
        self.index().twins_step(TWIN_BLOCK)
    }

    pub fn twins_export(&mut self) -> Vec<u8> {
        twins_to_bytes(self.index())
    }

    pub fn twins_import(&mut self, bytes: &[u8]) -> EngineResult<bool> {
        twins_from_bytes(self.index(), bytes)
    }

    /// Start the library test over the libraries `ids`, or carry on with the one already begun for the same libraries.
    /// Returns `(done, total)`.
    pub fn prova_start(&mut self, ids: &[String]) -> EngineResult<(usize, usize)> {
        let kept = self.prova.take();
        let index = self.index();
        let p = match kept {
            Some(p) if p.matches(index, ids) => p,
            _ => Prova::new(index, ids)?,
        };
        let progress = (p.done, p.total());
        self.prova = Some(p);
        Ok(progress)
    }

    /// Run `f` on the index and the test (taken out of `self` meanwhile; an index rebuilt since the test began, or a
    /// test that does not belong to it, is a refusal and the test is dropped).
    fn with_prova<T>(
        &mut self,
        f: impl FnOnce(&Index, &mut Prova) -> EngineResult<T>,
    ) -> EngineResult<T> {
        let mut p = self.prova.take().ok_or_else(no_prova)?;
        let index = self.index();
        if !p.matches(index, p.ids()) {
            return Err(no_prova());
        }
        let out = f(index, &mut p);
        self.prova = Some(p);
        out
    }

    /// Compute the next block of the test; returns `(done, total)`.
    pub fn prova_step(&mut self) -> EngineResult<(usize, usize)> {
        self.with_prova(|i, p| Ok(p.step(i, PROVA_BLOCK)))
    }

    /// JSON `prova-libreria/1` of the test so far.
    pub fn prova_report(&mut self) -> EngineResult<String> {
        let t = Thresholds::embedded()?;
        self.with_prova(|i, p| prova_rapporto::report(i, p, &t))
    }

    /// CSV of the test so far (ids and names only).
    pub fn prova_csv(&mut self) -> EngineResult<String> {
        let t = Thresholds::embedded()?;
        self.with_prova(|i, p| prova_rapporto::csv(i, p, &t))
    }

    /// `confronta`: JSON of `ftir-risultato-confronto/1`.
    pub fn compare(&mut self, query_json: &str, options_json: &str) -> EngineResult<String> {
        let t = Thresholds::embedded()?;
        let (q, o) = (parse_query(query_json)?, parse_options(options_json, &t)?);
        let previous = match (&o.sample_id, q.role) {
            (Some(id), Role::Sample) => {
                let deriv = prepare(&q)?.deriv;
                self.session.previous_for(id, deriv).map(<[f64]>::to_vec)
            }
            _ => None,
        };
        let index = self.index();
        Ok(search_with(index, &q, &o, &t, previous.as_deref())?.to_json(index))
    }

    /// Loaded libraries as JSON `[{"id","version","spectra"}]`.
    pub fn status(&self) -> String {
        let src = self.index.as_ref().map_or(&self.libraries, |i| &i.libs);
        let list = src.iter().map(|l| {
            Value::Obj(vec![
                ("id".into(), Value::Str(l.id.clone())),
                ("version".into(), Value::Str(l.version.clone())),
                ("spectra".into(), Value::Num(l.len() as f64)),
            ])
        });
        Value::Arr(list.collect()).write()
    }
}

fn no_prova() -> EngineError {
    EngineError::new("confronti.prova_non_avviata", "no library test in progress")
}

fn unknown(id: &str) -> EngineError {
    EngineError::new("confronti.libreria_sconosciuta", "library not loaded")
        .with_param("libreria", id)
}

/// The samples of the session, in memory only: the one being searched and the one before it.
#[derive(Default)]
struct Session {
    current: Option<(String, Vec<f64>)>,
    previous: Option<Vec<f64>>,
}

#[derive(Default)]
pub struct Motore {
    libraries: Vec<LibraryCache>,
    index: Option<Index>,
    prova: Option<Prova>,
    session: Session,
}
