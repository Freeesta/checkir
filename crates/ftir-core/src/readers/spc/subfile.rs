//! The subfiles of an SPC file: a 32-byte subheader, then (XY-per-subfile files) the x values, then the intensities.
use super::super::le::{self, f32_at, i16_at, i32_at, size, u32_at};
use super::super::model::{Limits, ReadError, ReadResult};
use super::header::{self, truncated, Header};

const SUBHEADER_LEN: usize = 32;

pub struct Sub {
    /// Own x values (explicit axis), or `None` when the file has one uniform axis.
    pub x: Option<Vec<f64>>,
    pub y: Vec<f64>,
}

fn bad(why: &str) -> ReadError {
    ReadError::new("reader.spc.bad_data").with("why", why)
}

fn floats(raw: &[u8]) -> Vec<f64> {
    raw.chunks_exact(4)
        .map(|c| f32_at(c, 0).map_or(f64::NAN, f64::from))
        .collect()
}

/// Intensities: float32 when the exponent byte says so, else 16- or 32-bit integers scaled by 2^exp / 2^bits.
fn intensities(raw: &[u8], h: &Header, sub_exp: u8) -> ReadResult<Vec<f64>> {
    if h.exp == header::FLOAT_EXP {
        return Ok(floats(raw));
    }
    let exp = i8::from_le_bytes([if sub_exp != 0 { sub_exp } else { h.exp }]);
    if exp == i8::MIN {
        return Err(bad("exponent"));
    }
    let wide = !h.has(header::Y16);
    let bits = if wide { 32 } else { 16 };
    let scale = 2f64.powi(i32::from(exp) - bits);
    let value = |c: &[u8]| {
        let raw = if wide {
            i32_at(c, 0).map(f64::from)
        } else {
            i16_at(c, 0).map(f64::from)
        };
        raw.map_or(f64::NAN, |r| r * scale)
    };
    Ok(raw
        .chunks_exact(if wide { 4 } else { 2 })
        .map(value)
        .collect())
}

/// `count` values of `width` bytes at `pos`, which moves past them; a file that ends first is truncated.
fn take<'a>(file: &'a [u8], pos: &mut usize, count: usize, width: usize) -> ReadResult<&'a [u8]> {
    let len = count.checked_mul(width).ok_or_else(truncated)?;
    let s = le::slice(file, *pos, len).ok_or_else(truncated)?;
    *pos += len;
    Ok(s)
}

/// Reads every subfile. Counts and sizes are checked against the limits and the length of the file before allocating.
pub fn read_all(file: &[u8], h: &Header, limits: &Limits) -> ReadResult<Vec<Sub>> {
    let nsub = if h.has(header::MULTI) {
        size(h.nsub).max(1)
    } else {
        1
    };
    if nsub > limits.max_spectra {
        return Err(ReadError::limit("spectra", limits.max_spectra));
    }
    let mut pos = header::HEADER_LEN;
    let mut shared: Option<Vec<f64>> = None;
    if h.has(header::XVALS) && !h.has(header::XYXY) {
        check_points(h.points(), 0, limits)?;
        shared = Some(floats(take(file, &mut pos, h.points(), 4)?));
    }
    let (mut subs, mut total) = (Vec::new(), 0usize);
    for _ in 0..nsub {
        let head = take(file, &mut pos, SUBHEADER_LEN, 1)?;
        let sub_exp = head.get(1).copied().unwrap_or(0);
        let n = if h.has(header::XYXY) {
            size(u32_at(head, 16).ok_or_else(truncated)?)
        } else {
            h.points()
        };
        total = check_points(n, total, limits)?;
        let x = if h.has(header::XYXY) {
            Some(floats(take(file, &mut pos, n, 4)?))
        } else {
            shared.clone()
        };
        let width = if h.exp == header::FLOAT_EXP || !h.has(header::Y16) {
            4
        } else {
            2
        };
        let raw = take(file, &mut pos, n, width)?;
        subs.push(Sub {
            x,
            y: intensities(raw, h, sub_exp)?,
        });
    }
    Ok(subs)
}

/// At least two points, and the points of the whole file within the limit; returns the new running total.
fn check_points(n: usize, total: usize, limits: &Limits) -> ReadResult<usize> {
    if n < 2 {
        return Err(bad("points"));
    }
    let total = total.saturating_add(n);
    if total > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    Ok(total)
}
