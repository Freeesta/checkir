//! Read-only Berkeley DB reader: hash method, version 5 (the 2.x generation), little endian.
//!
//! Written from the public description of the page layout, without `libdb`. Every page is visited at most once, so
//! circular chains and shared pages end in an error instead of a hang; sizes are checked before any allocation.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::model::{Limits, ReadError, ReadResult};

pub const HASH_MAGIC: u32 = 0x0006_1561;
pub const BTREE_MAGIC: u32 = 0x0005_3162;
pub const HASH_VERSION: u32 = 5;
/// Size of the page header (`lsn`, `pgno`, `prev`, `next`, `entries`, `hf_offset`, `level`, `type`).
const PAGE_HEADER: usize = 26;
const SPARES: usize = 32;
const P_HASH: u8 = 2;
const P_OVERFLOW: u8 = 7;
const H_KEYDATA: u8 = 1;
const H_OFFPAGE: u8 = 3;

/// One key/value pair of the database, in the order of the file (bucket order).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pair {
    pub key: Vec<u8>,
    pub value: Vec<u8>,
}

/// What the first bytes say about a Berkeley DB file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Hash {
        version: u32,
    },
    Btree {
        version: u32,
    },
    /// Magic number found in big-endian order.
    BigEndian {
        hash: bool,
        version: u32,
    },
}

fn u32_at(b: &[u8], off: usize) -> Option<u32> {
    let s = b.get(off..off.checked_add(4)?)?;
    Some(u32::from_le_bytes([
        *s.first()?,
        *s.get(1)?,
        *s.get(2)?,
        *s.get(3)?,
    ]))
}

fn u16_at(b: &[u8], off: usize) -> Option<usize> {
    let s = b.get(off..off.checked_add(2)?)?;
    Some(usize::from(u16::from_le_bytes([*s.first()?, *s.get(1)?])))
}

fn usz(v: u32) -> usize {
    usize::try_from(v).unwrap_or(usize::MAX)
}

/// Recognises a Berkeley DB meta page (magic at offset 12, version at 16).
pub fn sniff(head: &[u8]) -> Option<Kind> {
    let magic = u32_at(head, 12)?;
    let version = u32_at(head, 16)?;
    match magic {
        HASH_MAGIC => Some(Kind::Hash { version }),
        BTREE_MAGIC => Some(Kind::Btree { version }),
        _ => {
            let be = magic.swap_bytes();
            (be == HASH_MAGIC || be == BTREE_MAGIC).then(|| Kind::BigEndian {
                hash: be == HASH_MAGIC,
                version: version.swap_bytes(),
            })
        }
    }
}

fn corrupt(what: &str) -> ReadError {
    ReadError::new("reader.ispd.bdb_corrupt").with("what", what)
}

struct Db<'a> {
    bytes: &'a [u8],
    page_size: usize,
    used: Vec<bool>,
    budget: usize,
}

impl<'a> Db<'a> {
    fn page(&self, n: usize) -> ReadResult<&'a [u8]> {
        let start = n.checked_mul(self.page_size);
        let end = start.and_then(|s| s.checked_add(self.page_size));
        match (start, end) {
            (Some(s), Some(e)) => self
                .bytes
                .get(s..e)
                .ok_or_else(|| ReadError::new("reader.ispd.bdb_truncated").with("page", n)),
            _ => Err(corrupt("page-number")),
        }
    }

    /// Marks a page as visited; a page reached twice means a loop or shared pages.
    fn claim(&mut self, n: usize) -> ReadResult<()> {
        match self.used.get_mut(n) {
            Some(u) if !*u => {
                *u = true;
                Ok(())
            }
            Some(_) => Err(corrupt("page-reused")),
            None => Err(ReadError::new("reader.ispd.bdb_truncated").with("page", n)),
        }
    }

    fn take(&mut self, n: usize, limits: &Limits) -> ReadResult<()> {
        self.budget = self
            .budget
            .checked_sub(n)
            .ok_or_else(|| ReadError::limit("bytes", limits.max_bytes))?;
        Ok(())
    }
}

/// Follows an overflow chain and returns exactly `total` bytes.
fn overflow(db: &mut Db<'_>, first: usize, total: usize, limits: &Limits) -> ReadResult<Vec<u8>> {
    db.take(total, limits)?;
    let mut out = Vec::with_capacity(total.min(db.bytes.len()));
    let mut p = first;
    let mut steps = 0usize;
    while p != 0 {
        steps += 1;
        if steps > limits.max_chain {
            return Err(ReadError::limit("chain", limits.max_chain));
        }
        db.claim(p)?;
        let pg = db.page(p)?;
        if pg.get(25) != Some(&P_OVERFLOW) {
            return Err(corrupt("overflow-type"));
        }
        let used = u16_at(pg, 22).ok_or_else(|| corrupt("overflow-length"))?;
        let data = pg
            .get(PAGE_HEADER..PAGE_HEADER.saturating_add(used))
            .ok_or_else(|| corrupt("overflow-length"))?;
        if out.len().saturating_add(data.len()) > total {
            return Err(corrupt("overflow-total"));
        }
        out.extend_from_slice(data);
        p = usz(u32_at(pg, 16).ok_or_else(|| corrupt("overflow-next"))?);
    }
    if out.len() != total {
        return Err(corrupt("overflow-total"));
    }
    Ok(out)
}

fn item(
    db: &mut Db<'_>,
    pg: &[u8],
    off: usize,
    end: usize,
    limits: &Limits,
) -> ReadResult<Vec<u8>> {
    let body = pg.get(off..end).ok_or_else(|| corrupt("item-bounds"))?;
    match body.first() {
        Some(&H_KEYDATA) => {
            let data = body.get(1..).unwrap_or(&[]);
            db.take(data.len(), limits)?;
            Ok(data.to_vec())
        }
        Some(&H_OFFPAGE) => {
            let pgno = u32_at(body, 4).ok_or_else(|| corrupt("offpage"))?;
            let tlen = u32_at(body, 8).ok_or_else(|| corrupt("offpage"))?;
            overflow(db, usz(pgno), usz(tlen), limits)
        }
        _ => Err(corrupt("item-type")),
    }
}
/// Reads the pairs of one bucket chain.
fn bucket(db: &mut Db<'_>, first: usize, limits: &Limits, out: &mut Vec<Pair>) -> ReadResult<()> {
    let mut p = first;
    let mut steps = 0usize;
    while p != 0 {
        steps += 1;
        if steps > limits.max_chain {
            return Err(ReadError::limit("chain", limits.max_chain));
        }
        db.claim(p)?;
        let pg = db.page(p)?;
        let entries = u16_at(pg, 20).ok_or_else(|| corrupt("entries"))?;
        let next = usz(u32_at(pg, 16).ok_or_else(|| corrupt("next"))?);
        let kind = pg.get(25).copied().unwrap_or(0);
        if entries == 0 && kind == 0 {
            p = next;
            continue;
        }
        if kind != P_HASH || entries % 2 != 0 {
            return Err(corrupt("hash-page"));
        }
        if PAGE_HEADER + entries * 2 > db.page_size {
            return Err(corrupt("entries"));
        }
        let mut offs = Vec::with_capacity(entries);
        for i in 0..entries {
            offs.push(u16_at(pg, PAGE_HEADER + 2 * i).ok_or_else(|| corrupt("offsets"))?);
        }
        let mut end = db.page_size;
        let mut items = Vec::with_capacity(entries);
        for &o in &offs {
            if o >= end || o < PAGE_HEADER + entries * 2 {
                return Err(corrupt("offsets"));
            }
            items.push(item(db, pg, o, end, limits)?);
            end = o;
        }
        let mut it = items.into_iter();
        while let (Some(key), Some(value)) = (it.next(), it.next()) {
            if out.len() >= limits.max_fields {
                return Err(ReadError::limit("fields", limits.max_fields));
            }
            out.push(Pair { key, value });
        }
        p = next;
    }
    Ok(())
}

/// Page number of a bucket: `bucket + 1 + spares[ceil(log2(bucket + 1)) - 1]`.
fn bucket_page(bucket: u32, spares: &[u32]) -> Option<usize> {
    let mut page = usz(bucket).checked_add(1)?;
    if bucket > 0 {
        let log = (bucket + 1).next_power_of_two().trailing_zeros();
        let idx = usize::try_from(log).ok()?.checked_sub(1)?;
        page = page.checked_add(usz(*spares.get(idx)?))?;
    }
    Some(page)
}

/// Accepts only a little-endian hash database version 5; anything else gets a translated error.
fn check_kind(bytes: &[u8]) -> ReadResult<()> {
    match sniff(bytes) {
        None => return Err(ReadError::new("reader.ispd.bdb_magic")),
        Some(Kind::Btree { version }) => {
            return Err(ReadError::new("reader.ispd.bdb_method")
                .with("method", "btree")
                .with("version", version))
        }
        Some(Kind::BigEndian { hash, version }) => {
            return Err(ReadError::new("reader.ispd.bdb_version")
                .with("version", version)
                .with("order", "big-endian")
                .with("method", if hash { "hash" } else { "btree" }))
        }
        Some(Kind::Hash { version }) if version != HASH_VERSION => {
            return Err(ReadError::new("reader.ispd.bdb_version")
                .with("version", version)
                .with("order", "little-endian")
                .with("method", "hash"))
        }
        Some(Kind::Hash { .. }) => {}
    }
    Ok(())
}

/// Reads every pair of a hash database version 5.
pub fn read_hash(bytes: &[u8], limits: &Limits) -> ReadResult<Vec<Pair>> {
    if bytes.len() > limits.max_bytes {
        return Err(ReadError::limit("bytes", limits.max_bytes));
    }
    check_kind(bytes)?;
    let page_size = usz(u32_at(bytes, 20).ok_or_else(|| corrupt("meta"))?);
    if !(512..=65536).contains(&page_size) || !page_size.is_power_of_two() {
        return Err(ReadError::new("reader.ispd.bdb_page_size").with("size", page_size));
    }
    if bytes.len() < page_size {
        return Err(ReadError::new("reader.ispd.bdb_truncated").with("page", 0));
    }
    let max_bucket = u32_at(bytes, 32).ok_or_else(|| corrupt("meta"))?;
    let pages = bytes.len() / page_size;
    if usz(max_bucket) >= pages {
        return Err(corrupt("max-bucket"));
    }
    let mut spares = Vec::with_capacity(SPARES);
    for i in 0..SPARES {
        spares.push(u32_at(bytes, 56 + 4 * i).ok_or_else(|| corrupt("meta"))?);
    }
    let mut db = Db {
        bytes,
        page_size,
        used: vec![false; pages],
        budget: limits.max_bytes,
    };
    db.claim(0)?;
    let mut out = Vec::new();
    for b in 0..=max_bucket {
        let p = bucket_page(b, &spares).ok_or_else(|| corrupt("bucket-page"))?;
        bucket(&mut db, p, limits, &mut out)?;
    }
    Ok(out)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::indexing_slicing)]
mod test {
    use super::*;

    #[test]
    fn rejects_garbage() {
        let l = Limits::STANDARD;
        assert_eq!(
            read_hash(b"hello", &l).unwrap_err().key,
            "reader.ispd.bdb_magic"
        );
        let mut meta = vec![0u8; 8192];
        meta[12..16].copy_from_slice(&HASH_MAGIC.to_le_bytes());
        meta[16..20].copy_from_slice(&9u32.to_le_bytes());
        let e = read_hash(&meta, &l).unwrap_err();
        assert_eq!(e.key, "reader.ispd.bdb_version");
        meta[16..20].copy_from_slice(&5u32.to_le_bytes());
        meta[20..24].copy_from_slice(&8192u32.to_le_bytes());
        meta[32..36].copy_from_slice(&40u32.to_le_bytes());
        assert_eq!(
            read_hash(&meta, &l).unwrap_err().key,
            "reader.ispd.bdb_corrupt"
        );
    }
}
