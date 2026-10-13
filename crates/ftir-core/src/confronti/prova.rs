//! The library test ("Prova della libreria"): every spectrum of the active libraries searched in all the others, with
//! its own substance taken out, so the best match found is by construction a wrong one. What the thresholds let through
//! here is what they would let through for a substance that is not in the library. Computed in blocks of rows (the page
//! calls `step` repeatedly, may stop and carry on); the state holds three numbers per row and nothing spectral.
use super::indice::Index;
use super::punteggio::{pair, RowRef};
use crate::error::{EngineError, EngineResult};

/// Rows per block: each row costs one dot product with every other row.
pub const PROVA_BLOCK: usize = 64;

/// Progress and results of one test over a set of libraries.
#[derive(Debug, Clone)]
pub struct Prova {
    /// Global rows of the index that take part, library after library.
    pub rows: Vec<usize>,
    /// Identity of the test: the fingerprint of the index and the libraries chosen; a state is valid only for the same.
    index_fp: String,
    ids: Vec<String>,
    /// Best r with another substance (valid for the first `done` positions of `rows`).
    pub r1: Vec<f64>,
    /// Global row of that best match (`u32::MAX` = none).
    pub partner: Vec<u32>,
    /// Best r with a substance different from both the row's and the first match's (for the margin).
    pub r2: Vec<f64>,
    pub done: usize,
}

struct Best {
    r: f64,
    group: u32,
    row: u32,
}

impl Prova {
    /// A test over the libraries `ids` (all must be loaded and at least two substances must take part).
    pub fn new(index: &Index, ids: &[String]) -> EngineResult<Self> {
        let mut rows = Vec::new();
        for id in ids {
            let li = index.libs.iter().position(|l| &l.id == id).ok_or_else(|| {
                EngineError::new("confronti.libreria_sconosciuta", "library not loaded")
                    .with_param("libreria", id)
            })?;
            rows.extend(index.lib_range(li));
        }
        let mut groups: Vec<u32> = rows.iter().map(|g| index.group[*g]).collect();
        groups.sort_unstable();
        groups.dedup();
        if groups.len() < 2 {
            return Err(EngineError::new(
                "confronti.prova_pochi_dati",
                "the test needs at least two substances",
            ));
        }
        let n = rows.len();
        Ok(Self {
            rows,
            index_fp: index.fingerprint(),
            ids: ids.to_vec(),
            r1: vec![-1.0; n],
            partner: vec![u32::MAX; n],
            r2: vec![-1.0; n],
            done: 0,
        })
    }

    /// Does this state belong to the same libraries, chosen the same way?
    pub fn matches(&self, index: &Index, ids: &[String]) -> bool {
        self.ids == ids && self.index_fp == index.fingerprint()
    }

    pub fn ids(&self) -> &[String] {
        &self.ids
    }

    pub fn total(&self) -> usize {
        self.rows.len()
    }

    /// Bytes held by the state (three numbers per row plus the row list): the memory contract of the test.
    pub fn memory_bytes(&self) -> usize {
        self.rows.len() * (8 + 8 + 8 + 4 + 8)
    }

    /// Compute the next block of at most `rows` rows; returns `(done, total)`.
    pub fn step(&mut self, index: &Index, rows: usize) -> (usize, usize) {
        let refs: Vec<RowRef> = self.rows.iter().map(|g| index.deriv_row(*g)).collect();
        let groups: Vec<u32> = self.rows.iter().map(|g| index.group[*g]).collect();
        let end = (self.done + rows).min(self.rows.len());
        for k in self.done..end {
            let (b1, b2) = best_two(k, &refs, &groups, &self.rows);
            self.r1[k] = b1.r;
            self.partner[k] = b1.row;
            self.r2[k] = b2;
        }
        self.done = end;
        (end, self.rows.len())
    }
}

/// The best match of row `k` among the other substances, and the best among the substances other than that one.
fn best_two(k: usize, refs: &[RowRef], groups: &[u32], rows: &[usize]) -> (Best, f64) {
    let mut b1 = Best {
        r: -1.0,
        group: u32::MAX,
        row: u32::MAX,
    };
    let mut second = -1.0_f64;
    for h in 0..refs.len() {
        if groups[h] == groups[k] {
            continue;
        }
        let r = pair(refs[k], refs[h]);
        if r > b1.r {
            if b1.group != groups[h] {
                second = second.max(b1.r);
            }
            b1 = Best {
                r,
                group: groups[h],
                row: rows[h] as u32,
            };
        } else if groups[h] != b1.group && r > second {
            second = r;
        }
    }
    (b1, second)
}
