//! Synthetic `.ispd` fixtures: a minimal Berkeley DB hash file (version 5, little endian) written from scratch, with
//! invented objects (no real names, codes or serial numbers). The official `db_dump` must read them
//! (`tools/ispd_riferimento.py fixtures`), so that the writer and the reader do not share the same mistake.
use crate::readers::sha256::sha256_hex;

pub type Pairs = Vec<(Vec<u8>, Vec<u8>)>;

const HASH_MAGIC: u32 = 0x0006_1561;
const BUCKETS: usize = 4;
const HEADER: usize = 26;

pub(crate) fn put32(page: &mut [u8], off: usize, v: u32) {
    if let Some(s) = page.get_mut(off..off + 4) {
        s.copy_from_slice(&v.to_le_bytes());
    }
}

fn put16(page: &mut [u8], off: usize, v: usize) {
    if let Some(s) = page.get_mut(off..off + 2) {
        s.copy_from_slice(&u16::try_from(v).unwrap_or(0).to_le_bytes());
    }
}

pub(crate) fn pgno(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(0)
}

/// Pages being written: page 0 is the meta page, then one page per bucket, then overflow pages.
struct Writer {
    size: usize,
    pages: Vec<Vec<u8>>,
}

impl Writer {
    fn alloc(&mut self, kind: u8) -> usize {
        let n = self.pages.len();
        let mut p = vec![0u8; self.size];
        put32(&mut p, 8, pgno(n));
        if let Some(b) = p.get_mut(25) {
            *b = kind;
        }
        self.pages.push(p);
        n
    }

    /// Writes `data` on a chain of overflow pages; the chain starts at the highest page and goes down, like in real files.
    fn overflow(&mut self, data: &[u8]) -> usize {
        let room = self.size - HEADER;
        let chunks: Vec<&[u8]> = data.chunks(room).collect();
        let mut order: Vec<usize> = chunks.iter().map(|_| self.alloc(7)).collect();
        order.reverse();
        for (i, chunk) in chunks.iter().enumerate() {
            let id = order.get(i).copied().unwrap_or(0);
            let next = order.get(i + 1).copied().unwrap_or(0);
            let prev = i
                .checked_sub(1)
                .and_then(|j| order.get(j))
                .copied()
                .unwrap_or(0);
            if let Some(p) = self.pages.get_mut(id) {
                put16(p, 22, chunk.len());
                if let Some(s) = p.get_mut(HEADER..HEADER + chunk.len()) {
                    s.copy_from_slice(chunk);
                }
                put32(p, 12, pgno(prev));
                put32(p, 16, pgno(next));
            }
        }
        order.first().copied().unwrap_or(0)
    }
    fn item(&mut self, v: &[u8]) -> Vec<u8> {
        if v.len() + 1 > (self.size - HEADER) / 4 {
            let first = self.overflow(v);
            let mut it = vec![3u8, 0, 0, 0];
            it.extend_from_slice(&pgno(first).to_le_bytes());
            it.extend_from_slice(&pgno(v.len()).to_le_bytes());
            it
        } else {
            let mut it = vec![1u8];
            it.extend_from_slice(v);
            it
        }
    }
}

/// Fills the chain of hash pages of a bucket with the already encoded items (key, value, key, value, ...).
fn fill(w: &mut Writer, first: usize, items: &[Vec<u8>]) {
    let mut page = first;
    let mut entries = 0usize;
    let mut low = w.size;
    for pair in items.chunks(2) {
        let need: usize = pair.iter().map(Vec::len).sum::<usize>() + 4;
        if low < HEADER + 2 * entries + need {
            let next = w.alloc(2);
            if let Some(p) = w.pages.get_mut(next) {
                put32(p, 12, pgno(page));
            }
            if let Some(p) = w.pages.get_mut(page) {
                put32(p, 16, pgno(next));
            }
            page = next;
            entries = 0;
            low = w.size;
        }
        for it in pair {
            low -= it.len();
            if let Some(p) = w.pages.get_mut(page) {
                if let Some(s) = p.get_mut(low..low + it.len()) {
                    s.copy_from_slice(it);
                }
                put16(p, HEADER + 2 * entries, low);
                put16(p, 20, entries + 1);
                put16(p, 22, low);
            }
            entries += 1;
        }
    }
}

fn bucket_of(key: &[u8]) -> usize {
    let h = key
        .iter()
        .fold(0u32, |h, &b| h.wrapping_mul(16_777_619) ^ u32::from(b));
    usize::try_from(h).unwrap_or(0) % BUCKETS
}

/// Writes a Berkeley DB hash database version 5 holding `pairs`.
pub fn write_hash(pairs: &Pairs, page_size: usize) -> Vec<u8> {
    let mut w = Writer {
        size: page_size,
        pages: Vec::new(),
    };
    w.alloc(8);
    let heads: Vec<usize> = (0..BUCKETS).map(|_| w.alloc(2)).collect();
    let mut items: Vec<Vec<Vec<u8>>> = vec![Vec::new(); BUCKETS];
    for (k, v) in pairs {
        let (ik, iv) = (w.item(k), w.item(v));
        if let Some(list) = items.get_mut(bucket_of(k)) {
            list.push(ik);
            list.push(iv);
        }
    }
    for (head, list) in heads.iter().zip(&items) {
        fill(&mut w, *head, list);
    }
    let total = w.pages.len() - 1 - BUCKETS;
    if let Some(m) = w.pages.first_mut() {
        put32(m, 12, HASH_MAGIC);
        put32(m, 16, 5);
        put32(m, 20, pgno(page_size));
        put32(m, 24, 2);
        put32(m, 32, pgno(BUCKETS - 1));
        put32(m, 36, 3);
        put32(m, 40, 1);
        put32(m, 48, pgno(pairs.len()));
        put32(m, 56 + 4 * 3, pgno(total));
    }
    w.pages.concat()
}

/// Digest of the container as `tools/ispd_riferimento.py` computes it (pair count and digest of sorted fingerprints).
pub fn container_digest(pairs: &Pairs) -> (usize, String) {
    let mut prints: Vec<String> = pairs
        .iter()
        .map(|(k, v)| {
            let mut b = pgno(k.len()).to_le_bytes().to_vec();
            b.extend_from_slice(k);
            b.extend_from_slice(v);
            sha256_hex(&b)
        })
        .collect();
    prints.sort();
    (prints.len(), sha256_hex(prints.join("\n").as_bytes()))
}

pub use crate::synthetic_ispd_fixtures::{fixtures, truth_json, Fixture, Truth};
