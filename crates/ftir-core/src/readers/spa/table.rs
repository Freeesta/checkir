//! The section table of an OMNIC file: a count at byte 294, then 16-byte records from byte 304
//! (key at 0, position of the section at 2, its length at 6).
use super::super::le::{size, slice, u16_at, u32_at};
use super::super::model::{ReadError, ReadResult};

pub const COUNT_AT: usize = 294;
pub const TABLE_AT: usize = 304;
const RECORD: usize = 16;

/// Section keys the reader uses.
pub const INFO: u8 = 2;
pub const DATA: u8 = 3;
pub const COMMENT: u8 = 4;
pub const HISTORY: u8 = 27;
/// Present in the spectra of a library, whose date field means nothing.
pub const LIBRARY_TEXT: u8 = 0x53;

#[derive(Debug, Clone, Copy)]
pub struct Section {
    pub key: u8,
    pub pos: usize,
    pub len: usize,
}

impl Section {
    /// The bytes of the section; a section that ends after the file is a truncated file.
    pub fn bytes<'a>(&self, file: &'a [u8]) -> ReadResult<&'a [u8]> {
        slice(file, self.pos, self.len).ok_or_else(truncated)
    }
}

pub fn truncated() -> ReadError {
    ReadError::new("reader.spa.truncated")
}

/// Every record of the table; the file must hold the whole table.
pub fn read(file: &[u8]) -> ReadResult<Vec<Section>> {
    let count = usize::from(u16_at(file, COUNT_AT).ok_or_else(truncated)?);
    let table = slice(file, TABLE_AT, count * RECORD).ok_or_else(truncated)?;
    Ok(table
        .chunks_exact(RECORD)
        .filter_map(|r| {
            Some(Section {
                key: *r.first()?,
                pos: size(u32_at(r, 2)?),
                len: size(u32_at(r, 6)?),
            })
        })
        .collect())
}

pub fn find(sections: &[Section], key: u8) -> Option<&Section> {
    sections.iter().find(|s| s.key == key)
}
