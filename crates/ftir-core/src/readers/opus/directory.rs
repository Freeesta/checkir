//! Header and directory of an OPUS file: a signature, the position and size of the directory, then 12-byte entries
//! (data type, channel, text type, extra, length in 4-byte words, offset). Nothing is followed: no entry leads to another.
use crate::readers::model::{Limits, ReadError, ReadResult};

pub const MAGIC: [u8; 4] = [0x0a, 0x0a, 0xfe, 0xfe];
/// Smallest valid start of the directory (the header is 24 bytes).
pub const FIRST_DIR: usize = 24;
pub const ENTRY: usize = 12;

pub fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    let end = at.checked_add(4)?;
    b.get(at..end)?.try_into().ok().map(u32::from_le_bytes)
}

pub fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    let end = at.checked_add(2)?;
    b.get(at..end)?.try_into().ok().map(u16::from_le_bytes)
}

pub fn f64_at(b: &[u8], at: usize) -> Option<f64> {
    let end = at.checked_add(8)?;
    b.get(at..end)?.try_into().ok().map(f64::from_le_bytes)
}

/// One directory entry.
#[derive(Debug, Clone, Copy)]
pub struct Block {
    /// Position in the directory, from 1.
    pub n: usize,
    pub data_type: u8,
    pub channel: u8,
    pub text_type: u8,
    pub words: u32,
    pub offset: u32,
}

impl Block {
    /// The bytes of the block, `None` when the file ends before the block does.
    pub fn chunk<'a>(&self, bytes: &'a [u8]) -> Option<&'a [u8]> {
        let start = usize::try_from(self.offset).ok()?;
        let len = usize::try_from(self.words).ok()?.checked_mul(4)?;
        bytes.get(start..start.checked_add(len)?)
    }
}

/// Which series a data block or its parameter block describes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Ab,
    ScSm,
    IgSm,
    PhSm,
    ScRf,
    IgRf,
}

impl Kind {
    /// Field key of the data block.
    pub fn key(self) -> &'static str {
        match self {
            Kind::Ab => "AB",
            Kind::ScSm => "SCSM",
            Kind::IgSm => "IGSM",
            Kind::PhSm => "PHSM",
            Kind::ScRf => "SCRF",
            Kind::IgRf => "IGRF",
        }
    }
}

/// What a block holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Class {
    Data(Kind),
    DataParams(Kind),
    /// A parameter list; the prefix names its fields (`INST`, `ACQ`, `FT`, `OPT`, `SMP`, `INFO`, `_RF` for the background).
    Params(&'static str),
    Text(&'static str),
    Other,
}

fn series(data_type: u8, channel: u8) -> Option<Kind> {
    match (data_type, channel) {
        (7 | 23, 4) => Some(Kind::ScSm),
        (7 | 23, 8) => Some(Kind::IgSm),
        (7 | 23, 12) => Some(Kind::PhSm),
        (11 | 27, 4) => Some(Kind::ScRf),
        (11 | 27, 8) => Some(Kind::IgRf),
        (15 | 31, _) => Some(Kind::Ab),
        _ => None,
    }
}

pub fn classify(b: &Block) -> Class {
    match b.data_type {
        7 | 11 | 15 => series(b.data_type, b.channel).map_or(Class::Other, Class::Data),
        23 | 27 | 31 => series(b.data_type, b.channel).map_or(Class::Other, Class::DataParams),
        32 => Class::Params("INST"),
        40 => Class::Params("INST_RF"),
        48 => Class::Params("ACQ"),
        56 => Class::Params("ACQ_RF"),
        64 => Class::Params("FT"),
        72 => Class::Params("FT_RF"),
        96 => Class::Params("OPT"),
        104 => Class::Params("OPT_RF"),
        160 => Class::Params("SMP"),
        0 => match b.text_type {
            8 => Class::Params("INFO"),
            104 => Class::Text("HISTORY"),
            152 => Class::Text("CURVEFIT"),
            168 => Class::Text("SIGNATURE"),
            240 => Class::Text("INTEGRATION"),
            _ => Class::Text("TEXT"),
        },
        _ => Class::Other,
    }
}

fn truncated(what: &str) -> ReadError {
    ReadError::new("reader.opus.truncated").with("what", what)
}

fn corrupt(what: &str) -> ReadError {
    ReadError::new("reader.opus.corrupt").with("what", what)
}

/// Reads the directory. The entries must lie inside the file and no block may start inside the header or the directory.
pub fn parse(bytes: &[u8], limits: &Limits) -> ReadResult<Vec<Block>> {
    if bytes.get(..4) != Some(&MAGIC[..]) {
        return Err(ReadError::new("reader.opus.magic"));
    }
    let first = u32_at(bytes, 12).ok_or_else(|| truncated("header"))?;
    let count = u32_at(bytes, 20).ok_or_else(|| truncated("header"))?;
    let first = usize::try_from(first).map_err(|_| corrupt("directory"))?;
    let count = usize::try_from(count).map_err(|_| corrupt("directory"))?;
    if first < FIRST_DIR {
        return Err(corrupt("directory"));
    }
    if count > limits.max_fields {
        return Err(ReadError::limit("fields", limits.max_fields));
    }
    let end = count
        .checked_mul(ENTRY)
        .and_then(|n| n.checked_add(first))
        .ok_or_else(|| corrupt("directory"))?;
    if end > bytes.len() {
        return Err(truncated("directory"));
    }
    let mut blocks = Vec::new();
    for i in 0..count {
        let at = first + i * ENTRY;
        let kinds = bytes
            .get(at..at + 4)
            .ok_or_else(|| truncated("directory"))?;
        let (Some(&data_type), Some(&channel), Some(&text_type)) =
            (kinds.first(), kinds.get(1), kinds.get(2))
        else {
            return Err(truncated("directory"));
        };
        let words = u32_at(bytes, at + 4).ok_or_else(|| truncated("directory"))?;
        let offset = u32_at(bytes, at + 8).ok_or_else(|| truncated("directory"))?;
        if offset == 0 {
            break;
        }
        if usize::try_from(offset).map_or(true, |o| o < end) {
            return Err(corrupt("block_in_directory"));
        }
        blocks.push(Block {
            n: i + 1,
            data_type,
            channel,
            text_type,
            words,
            offset,
        });
    }
    Ok(blocks)
}
