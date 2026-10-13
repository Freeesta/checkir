//! The active libraries searched together: rows numbered across libraries, substance groups, and the spectral twins
//! (for every row, the best r with a row of a different substance). Twins cost ~n² dot products, so they are computed
//! in blocks of rows while the search already works; a result says "twins in progress" until its row is done.
use super::libreria::{LibEntry, LibraryCache};
use super::punteggio::{pair, RowRef};
use super::CACHE_VERSION;
use std::collections::HashMap;

/// Rows per twin block (the page calls `twins_step` repeatedly and may save the state between blocks).
pub const TWIN_BLOCK: usize = 256;

impl Index {
    pub fn new(libs: Vec<LibraryCache>) -> Self {
        let mut offsets = Vec::with_capacity(libs.len());
        let mut total = 0;
        for l in &libs {
            offsets.push(total);
            total += l.len();
        }
        let (group, grouping) = identity_groups(&libs);
        let twins = Twins {
            r: vec![-1.0; total],
            partner: vec![u32::MAX; total],
            done: 0,
        };
        let mut index = Self {
            libs,
            offsets,
            group,
            grouping,
            twins,
        };
        index.merge_identical_rows();
        index
    }

    /// Rows with the same derivative values are the same spectrum under two names (a folder imported next to the public
    /// library): they join the group of the first one, so neither the margin nor the twins count a copy as another substance.
    fn merge_identical_rows(&mut self) {
        let mut first: HashMap<u64, Vec<usize>> = HashMap::new();
        for g in 0..self.total() {
            let row = self.deriv_row(g);
            let mut h: u64 = 0xcbf2_9ce4_8422_2325;
            for x in row
                .v
                .iter()
                .map(|x| u64::from(x.to_bits()))
                .chain(row.p.iter().map(|p| u64::from(*p)))
            {
                h = (h ^ x).wrapping_mul(0x0100_0000_01b3);
            }
            let same = first.entry(h).or_default();
            let found = same.iter().copied().find(|&f| {
                let other = self.deriv_row(f);
                other
                    .v
                    .iter()
                    .map(|x| x.to_bits())
                    .eq(row.v.iter().map(|x| x.to_bits()))
                    && other.p == row.p
            });
            match found {
                Some(f) => self.group[g] = self.group[f],
                None => same.push(g),
            }
        }
    }

    pub fn total(&self) -> usize {
        self.group.len()
    }

    /// Library index and row inside it for global row `g`.
    pub fn locate(&self, g: usize) -> (usize, usize) {
        let li = self.offsets.partition_point(|o| *o <= g) - 1;
        (li, g - self.offsets[li])
    }

    pub fn entry(&self, g: usize) -> &LibEntry {
        let (li, i) = self.locate(g);
        &self.libs[li].entries[i]
    }

    pub fn lib_range(&self, li: usize) -> std::ops::Range<usize> {
        self.offsets[li]..self.offsets[li] + self.libs[li].len()
    }

    pub fn deriv_row(&self, g: usize) -> RowRef<'_> {
        let (li, i) = self.locate(g);
        let m = &self.libs[li].deriv;
        RowRef {
            v: m.row(i),
            p: m.presence(i),
            full: m.full[i],
        }
    }

    /// The twin of row `g`: `(r, partner row)` once computed and when one exists.
    pub fn twin(&self, g: usize) -> Option<(f64, usize)> {
        (g < self.twins.done && self.twins.partner[g] != u32::MAX)
            .then(|| (self.twins.r[g], self.twins.partner[g] as usize))
    }

    /// Compute the next block of at most `rows` rows; returns `(done, total)`.
    pub fn twins_step(&mut self, rows: usize) -> (usize, usize) {
        let total = self.total();
        let end = (self.twins.done + rows).min(total);
        for g in self.twins.done..end {
            let a = self.deriv_row(g);
            let (mut best, mut partner) = (-1.0, u32::MAX);
            for (li, lib) in self.libs.iter().enumerate() {
                for i in 0..lib.len() {
                    let h = self.offsets[li] + i;
                    if self.group[h] == self.group[g] {
                        continue;
                    }
                    let b = RowRef {
                        v: lib.deriv.row(i),
                        p: lib.deriv.presence(i),
                        full: lib.deriv.full[i],
                    };
                    let r = pair(a, b);
                    if r > best {
                        (best, partner) = (r, h as u32);
                    }
                }
            }
            self.twins.r[g] = best;
            self.twins.partner[g] = partner;
        }
        self.twins.done = end;
        (end, total)
    }

    /// Identity of this set of libraries: a saved twin state is valid only for the same fingerprint.
    pub fn fingerprint(&self) -> String {
        let parts: Vec<String> = self
            .libs
            .iter()
            .map(|l| format!("{}@{}#{}", l.id, l.version, l.len()))
            .collect();
        format!("v{CACHE_VERSION}:{}", parts.join("|"))
    }
}

/// Group id per global row. Rows join the same group when they share an InChIKey or a substance id (either link is
/// enough); a row with neither is grouped by its normalised name. Group ids number the groups in order of first row.
fn identity_groups(libs: &[LibraryCache]) -> (Vec<u32>, Grouping) {
    let entries: Vec<&LibEntry> = libs.iter().flat_map(|l| l.entries.iter()).collect();
    let mut parent: Vec<usize> = (0..entries.len()).collect();
    fn root(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        x
    }
    let mut seen: HashMap<String, usize> = HashMap::new();
    let (mut by_id, mut by_name) = (false, false);
    for (i, e) in entries.iter().enumerate() {
        let mut keys = Vec::new();
        if let Some(k) = &e.inchikey {
            keys.push(format!("ik:{k}"));
        }
        if let Some(s) = &e.substance {
            keys.push(format!("id:{s}"));
        }
        if keys.is_empty() {
            by_name = true;
            keys.push(format!("name:{}", normalize_name(&e.display_name)));
        } else {
            by_id = true;
        }
        for key in keys {
            let first = *seen.entry(key).or_insert(i);
            let (a, b) = (root(&mut parent, first), root(&mut parent, i));
            parent[a.max(b)] = a.min(b);
        }
    }
    let mut ids: HashMap<usize, u32> = HashMap::new();
    let group = (0..entries.len())
        .map(|i| {
            let r = root(&mut parent, i);
            let next = ids.len() as u32;
            *ids.entry(r).or_insert(next)
        })
        .collect();
    let grouping = match (by_id, by_name) {
        (true, true) => Grouping::Mixed,
        (false, true) => Grouping::Name,
        _ => Grouping::Identity,
    };
    (group, grouping)
}

/// How the substances were grouped: by the identity given by the library or by the normalised name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Grouping {
    Identity,
    Name,
    Mixed,
}

#[derive(Debug, Clone)]
pub struct Twins {
    /// Best r with a different substance, valid for rows `< done`.
    pub r: Vec<f64>,
    /// Global row of that twin (`u32::MAX` = none).
    pub partner: Vec<u32>,
    pub done: usize,
}

/// Lowercase, letters and digits only, single spaces: the fallback identity when a library gives none.
pub fn normalize_name(s: &str) -> String {
    let lower: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_lowercase().next().unwrap_or(c)
            } else {
                ' '
            }
        })
        .collect();
    lower.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Debug)]
pub struct Index {
    pub libs: Vec<LibraryCache>,
    offsets: Vec<usize>,
    pub group: Vec<u32>,
    pub grouping: Grouping,
    pub twins: Twins,
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn names_are_normalised() {
        assert_eq!(normalize_name("  MDMA (Lot #4) HCl "), "mdma lot 4 hcl");
    }
}
