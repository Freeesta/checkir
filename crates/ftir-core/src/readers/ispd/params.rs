//! The instrument parameter list (object property `103700`): a count, then `id`, `type`, value for each entry.
//!
//! Types: 4 = 32-bit integer, 1 = one byte, 8 = a double or a length-prefixed text. The two meanings of 8 are told
//! apart by the id (tables below, observed on every file); an id not in the tables is guessed and reported.
use super::objects::{read_text, read_u32};

/// Ids that hold text.
const TEXT_IDS: &[i32] = &[
    1032, 1072, 1105, 1106, 1109, 1162, 1163, 1164, 1180, 1181, 1182, 1183, 1200,
];
/// Ids of type 8 that hold a double.
const REAL_IDS: &[i32] = &[1004, 1034, 1035, 1073, 1074, 1075, 1076];

/// Ids seen in the files (a test keeps `tests/audit/noti_ispd.txt` equal to this list).
pub const KNOWN_IDS: &[i32] = &[
    1000, 1001, 1002, 1003, 1004, 1032, 1034, 1035, 1036, 1037, 1042, 1043, 1049, 1050, 1052, 1054,
    1055, 1057, 1061, 1062, 1063, 1064, 1065, 1072, 1073, 1074, 1075, 1076, 1077, 1102, 1103, 1104,
    1105, 1106, 1107, 1108, 1109, 1110, 1111, 1117, 1118, 1121, 1133, 1136, 1139, 1140, 1141, 1145,
    1146, 1149, 1150, 1154, 1155, 1162, 1163, 1164, 1165, 1166, 1180, 1181, 1182, 1183, 1184, 1185,
    1186, 1187, 1200, 5239, 10129, 10130, 10131,
];

const MAX_ENTRIES: u32 = 1000;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i32),
    Byte(u8),
    Real(f64),
    Text(String),
}

pub struct Param {
    pub id: i32,
    pub value: Value,
    /// The id is in neither table: type 8 was guessed.
    pub guessed: bool,
}

pub struct Parsed {
    pub params: Vec<Param>,
    pub latin1: bool,
}

fn int_at(b: &[u8], off: usize) -> Option<i32> {
    read_u32(b, off).map(|v| i32::from_le_bytes(v.to_le_bytes()))
}

fn real_at(b: &[u8], off: usize) -> Option<f64> {
    let s = b.get(off..off.checked_add(8)?)?;
    let mut a = [0u8; 8];
    a.copy_from_slice(s);
    Some(f64::from_le_bytes(a))
}

/// A text of type 8 for an id outside the tables: plausible when it parses and the next entry looks like an entry.
fn plausible_text(b: &[u8], off: usize) -> bool {
    let Some((t, end, _)) = read_text(b, off) else {
        return false;
    };
    let ascii = t.chars().all(|c| c.is_ascii() && !c.is_ascii_control());
    let next_ok = match (int_at(b, end), int_at(b, end.saturating_add(4))) {
        (Some(id), Some(ty)) => {
            (0 < id && id < 100_000 && matches!(ty, 1 | 4 | 8)) || end == b.len()
        }
        _ => end == b.len(),
    };
    ascii && next_ok
}

fn eight(b: &[u8], id: i32, off: usize, latin1: &mut bool) -> Option<(Value, usize, bool)> {
    let as_real = |g| real_at(b, off).map(|v| (Value::Real(v), off + 8, g));
    let as_text = |g, l: &mut bool| {
        let (t, end, lat) = read_text(b, off)?;
        *l |= lat;
        Some((Value::Text(t), end, g))
    };
    if TEXT_IDS.contains(&id) {
        as_text(false, latin1)
    } else if REAL_IDS.contains(&id) {
        as_real(false)
    } else if plausible_text(b, off) {
        as_text(true, latin1)
    } else {
        as_real(true)
    }
}

/// Reads the whole list; `None` unless the entries end exactly at the end of the value.
pub fn parse(b: &[u8]) -> Option<Parsed> {
    let count = read_u32(b, 0)?;
    if count > MAX_ENTRIES {
        return None;
    }
    let mut p = 4usize;
    let mut params = Vec::new();
    let mut latin1 = false;
    for _ in 0..count {
        let id = int_at(b, p)?;
        let ty = int_at(b, p.checked_add(4)?)?;
        p = p.checked_add(8)?;
        let (value, next, guessed) = match ty {
            4 => (Value::Int(int_at(b, p)?), p.checked_add(4)?, false),
            1 => (Value::Byte(*b.get(p)?), p.checked_add(1)?, false),
            8 => eight(b, id, p, &mut latin1)?,
            _ => return None,
        };
        p = next;
        params.push(Param { id, value, guessed });
    }
    (p == b.len()).then_some(Parsed { params, latin1 })
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::indexing_slicing)]
mod test {
    use super::*;

    fn entry(id: i32, ty: i32, body: &[u8]) -> Vec<u8> {
        let mut v = id.to_le_bytes().to_vec();
        v.extend_from_slice(&ty.to_le_bytes());
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn reads_every_type_and_refuses_trailing_bytes() {
        let mut b = 4u32.to_le_bytes().to_vec();
        b.extend(entry(1002, 4, &15i32.to_le_bytes()));
        b.extend(entry(1004, 8, &4.0f64.to_le_bytes()));
        b.extend(entry(1200, 8, &[3, 0, 0, 0, b'a', b'b', b'c']));
        b.extend(entry(1062, 1, &[7]));
        let p = parse(&b).unwrap();
        assert_eq!(p.params.len(), 4);
        assert_eq!(p.params[1].value, Value::Real(4.0));
        assert_eq!(p.params[2].value, Value::Text("abc".into()));
        assert!(p.params.iter().all(|x| !x.guessed));
        b.push(0);
        assert!(parse(&b).is_none());
    }

    #[test]
    fn unknown_ids_are_guessed() {
        let mut b = 2u32.to_le_bytes().to_vec();
        b.extend(entry(9999, 8, &[2, 0, 0, 0, b'o', b'k']));
        b.extend(entry(9998, 8, &1.5f64.to_le_bytes()));
        let p = parse(&b).unwrap();
        assert_eq!(p.params[0].value, Value::Text("ok".into()));
        assert_eq!(p.params[1].value, Value::Real(1.5));
        assert!(p.params.iter().all(|x| x.guessed));
    }
}
