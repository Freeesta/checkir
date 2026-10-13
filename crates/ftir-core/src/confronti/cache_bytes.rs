//! Binary form of a prepared library and of the twin state, so the page can keep them in OPFS or IndexedDB.
//! Little-endian, no compression. A cache of another `CACHE_VERSION` is refused (`confronti.cache_obsoleta`): the page
//! rebuilds it from the spectra, it is never migrated.
use super::indice::Index;
use super::libreria::{LibEntry, LibraryCache, Matrix};
use super::{CACHE_VERSION, GRID_N};
use crate::error::{EngineError, EngineResult};

const MAGIC_LIB: &[u8; 4] = b"CHKL";
const MAGIC_TWINS: &[u8; 4] = b"CHKT";

fn corrupt() -> EngineError {
    EngineError::new("confronti.cache_non_valida", "the saved cache is damaged")
}

struct Reader<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> EngineResult<&'a [u8]> {
        let end = self
            .i
            .checked_add(n)
            .filter(|e| *e <= self.b.len())
            .ok_or_else(corrupt)?;
        let s = &self.b[self.i..end];
        self.i = end;
        Ok(s)
    }

    fn u32(&mut self) -> EngineResult<u32> {
        Ok(u32::from_le_bytes(
            self.take(4)?.try_into().map_err(|_| corrupt())?,
        ))
    }

    fn u64(&mut self) -> EngineResult<u64> {
        Ok(u64::from_le_bytes(
            self.take(8)?.try_into().map_err(|_| corrupt())?,
        ))
    }

    fn str(&mut self) -> EngineResult<String> {
        let n = self.u32()? as usize;
        String::from_utf8(self.take(n)?.to_vec()).map_err(|_| corrupt())
    }
}

fn put_str(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u32).to_le_bytes());
    out.extend(s.as_bytes());
}

fn put_matrix(out: &mut Vec<u8>, m: &Matrix) {
    out.extend(m.data.iter().flat_map(|x| x.to_le_bytes()));
    out.extend(&m.present);
    out.extend(m.full.iter().map(|f| u8::from(*f)));
}

fn get_matrix(r: &mut Reader, rows: usize) -> EngineResult<Matrix> {
    let cells = rows.checked_mul(GRID_N).ok_or_else(corrupt)?;
    let data = r
        .take(cells.checked_mul(4).ok_or_else(corrupt)?)?
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    let present = r.take(cells)?.to_vec();
    let full = r.take(rows)?.iter().map(|f| *f == 1).collect();
    Ok(Matrix {
        data,
        present,
        full,
    })
}

/// The prepared library as bytes.
pub fn library_to_bytes(l: &LibraryCache) -> Vec<u8> {
    let mut out = Vec::with_capacity(l.len() * GRID_N * 10 + 256);
    out.extend(MAGIC_LIB);
    out.extend(CACHE_VERSION.to_le_bytes());
    put_str(&mut out, &l.id);
    put_str(&mut out, &l.version);
    out.extend((l.len() as u32).to_le_bytes());
    for e in &l.entries {
        put_str(&mut out, &e.id);
        out.push(u8::from(e.substance.is_some()));
        put_str(&mut out, e.substance.as_deref().unwrap_or(""));
        put_str(&mut out, &e.display_name);
        put_str(&mut out, &e.form);
    }
    put_matrix(&mut out, &l.deriv);
    put_matrix(&mut out, &l.spec);
    out
}

/// Read a library saved by `library_to_bytes`.
pub fn library_from_bytes(bytes: &[u8]) -> EngineResult<LibraryCache> {
    let mut r = Reader { b: bytes, i: 0 };
    if r.take(4)? != MAGIC_LIB {
        return Err(corrupt());
    }
    if r.u32()? != CACHE_VERSION {
        return Err(EngineError::new(
            "confronti.cache_obsoleta",
            "the cache was built by another version",
        ));
    }
    let (id, version) = (r.str()?, r.str()?);
    let n = r.u32()? as usize;
    let mut entries = Vec::with_capacity(n.min(1 << 16));
    for _ in 0..n {
        let id = r.str()?;
        let has = r.take(1)?[0] == 1;
        let substance = r.str()?;
        entries.push(LibEntry {
            id,
            substance: has.then_some(substance),
            display_name: r.str()?,
            form: r.str()?,
        });
    }
    let (deriv, spec) = (get_matrix(&mut r, n)?, get_matrix(&mut r, n)?);
    Ok(LibraryCache {
        id,
        version,
        entries,
        deriv,
        spec,
    })
}

/// Resume from saved twins. `Ok(false)` when they belong to other libraries (nothing changes).
pub fn twins_from_bytes(index: &mut Index, bytes: &[u8]) -> EngineResult<bool> {
    let mut r = Reader { b: bytes, i: 0 };
    if r.take(4)? != MAGIC_TWINS {
        return Err(corrupt());
    }
    if r.str()? != index.fingerprint() {
        return Ok(false);
    }
    let done = usize::try_from(r.u64()?).map_err(|_| corrupt())?;
    if done > index.total() {
        return Err(corrupt());
    }
    let rs: Vec<f64> = r
        .take(done * 8)?
        .chunks_exact(8)
        .map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]))
        .collect();
    let ps: Vec<u32> = r
        .take(done * 4)?
        .chunks_exact(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    index.twins.r[..done].copy_from_slice(&rs);
    index.twins.partner[..done].copy_from_slice(&ps);
    index.twins.done = done;
    Ok(true)
}

/// The twins computed so far, valid only for the same libraries (fingerprint).
pub fn twins_to_bytes(index: &Index) -> Vec<u8> {
    let t = &index.twins;
    let mut out = Vec::new();
    out.extend(MAGIC_TWINS);
    put_str(&mut out, &index.fingerprint());
    out.extend((t.done as u64).to_le_bytes());
    out.extend(t.r.iter().take(t.done).flat_map(|x| x.to_le_bytes()));
    out.extend(t.partner.iter().take(t.done).flat_map(|x| x.to_le_bytes()));
    out
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::confronti::libreria::Matrix;

    fn library() -> LibraryCache {
        let mut l = LibraryCache::new("lib", "1.0");
        for k in 0..2 {
            let v: Vec<f64> = (0..GRID_N)
                .map(|i| (i as f64 * 0.05 * (k + 1) as f64).sin())
                .collect();
            l.deriv.push(&v);
            l.spec.push(&v);
            l.entries.push(LibEntry {
                id: format!("s{k}"),
                substance: (k == 0).then(|| "x".to_string()),
                display_name: "Ünïcode".into(),
                form: "base".into(),
            });
        }
        l
    }

    #[test]
    fn a_library_round_trips() {
        let l = library();
        let back = library_from_bytes(&library_to_bytes(&l)).unwrap();
        assert_eq!(back, l);
        let _ = Matrix::default();
    }

    #[test]
    fn damaged_and_obsolete_caches_are_refused() {
        let mut bytes = library_to_bytes(&library());
        assert_eq!(
            library_from_bytes(&bytes[..bytes.len() - 5])
                .unwrap_err()
                .error_key,
            "confronti.cache_non_valida"
        );
        assert!(library_from_bytes(b"nope").is_err());
        bytes[4] = 99;
        assert_eq!(
            library_from_bytes(&bytes).unwrap_err().error_key,
            "confronti.cache_obsoleta"
        );
    }

    #[test]
    fn twin_state_resumes_only_for_the_same_libraries() {
        let mut a = Index::new(vec![library()]);
        a.twins_step(1);
        let saved = twins_to_bytes(&a);
        let mut b = Index::new(vec![library()]);
        assert!(twins_from_bytes(&mut b, &saved).unwrap());
        assert_eq!(b.twins.done, 1);
        let mut other = LibraryCache::new("lib", "2.0");
        other.entries.clear();
        let mut c = Index::new(vec![other]);
        assert!(!twins_from_bytes(&mut c, &saved).unwrap());
    }
}
