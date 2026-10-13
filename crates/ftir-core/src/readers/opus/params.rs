//! Parameter lists: records of a 3-letter name, a type, a length in 16-bit words and the value, ended by `END`.
use super::directory::{f64_at, u16_at, u32_at};

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i32),
    Real(f64),
    Text(String),
    /// A type this reader does not decode (kept as length and digest).
    Raw(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Param {
    pub name: String,
    pub value: Value,
}

pub struct Parsed {
    pub params: Vec<Param>,
    /// The list stops before `END` (the block ends, or a record is not valid).
    pub broken: bool,
}

fn latin1(b: &[u8]) -> String {
    let body = b.split(|&c| c == 0).next().unwrap_or(&[]);
    body.iter().map(|&c| char::from(c)).collect()
}

fn value(kind: u16, data: &[u8]) -> Value {
    match kind {
        0 => u32_at(data, 0)
            .map(|v| Value::Int(i32::from_le_bytes(v.to_le_bytes())))
            .unwrap_or_else(|| Value::Raw(data.to_vec())),
        1 => f64_at(data, 0).map_or_else(|| Value::Raw(data.to_vec()), Value::Real),
        2..=4 => Value::Text(latin1(data)),
        _ => Value::Raw(data.to_vec()),
    }
}

/// At most `max` records are read (every one becomes a field, so the budget of fields applies).
pub fn parse(chunk: &[u8], max: usize) -> Parsed {
    let mut out = Parsed {
        params: Vec::new(),
        broken: true,
    };
    let mut at = 0usize;
    while let Some(head) = chunk.get(at..at.saturating_add(8)) {
        let name = head.get(..3).unwrap_or(&[]);
        if name == b"END" {
            out.broken = false;
            break;
        }
        if !name.iter().all(|c| (0x20..0x7f).contains(c)) || out.params.len() >= max {
            break;
        }
        let (Some(kind), Some(words)) = (u16_at(head, 4), u16_at(head, 6)) else {
            break;
        };
        let len = usize::from(words) * 2;
        let Some(data) = chunk.get(at + 8..at + 8 + len) else {
            break;
        };
        out.params.push(Param {
            name: String::from_utf8_lossy(name).trim().to_string(),
            value: value(kind, data),
        });
        at += 8 + len;
    }
    out
}
