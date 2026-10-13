//! Synthetic Galactic `.spc` files (new format 0x4B) with their truth: uniform axis or x values, several subfiles, float32 or
//! 16/32-bit integer intensities. Invented comment and date.
use crate::synthetic_spa::absorbance;

pub const FLOAT: u8 = 0x80;
pub const Y16: u8 = 0x01;
pub const MULTI: u8 = 0x04;
pub const XYXY: u8 = 0x40;
pub const XVALS: u8 = 0x80;

pub const COMMENT: &str = "invented comment";
/// 2026-03-14 12:00 packed as minute 6, hour 5, day 5, month 4, year 12 bits.
pub const DATE: u32 = (2026 << 20) | (3 << 16) | (14 << 11) | (12 << 6);

#[derive(Debug, Clone)]
pub struct SubSpec {
    /// Own x values (XY-per-subfile files).
    pub x: Option<Vec<f64>>,
    pub y: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct SpcSpec {
    pub version: u8,
    pub flags: u8,
    pub exp: u8,
    pub x_type: u8,
    pub y_type: u8,
    pub first: f64,
    pub last: f64,
    /// One x array for all the subfiles (flag `XVALS`).
    pub x: Option<Vec<f64>>,
    pub subs: Vec<SubSpec>,
}

fn spec(flags: u8, exp: u8, subs: Vec<SubSpec>) -> SpcSpec {
    SpcSpec {
        version: 0x4B,
        flags,
        exp,
        x_type: 1,
        y_type: 2,
        first: 4000.0,
        last: 400.0,
        x: None,
        subs,
    }
}

fn one(y: Vec<f64>) -> Vec<SubSpec> {
    vec![SubSpec { x: None, y }]
}

/// The committed fixtures `(name, spec)`.
pub fn fixtures() -> Vec<(&'static str, SpcSpec)> {
    let a = absorbance();
    let grid: Vec<f64> = (0..a.len()).map(|i| 4000.0 - 20.0 * i as f64).collect();
    let scaled = |k: f64| a.iter().map(|v| v * k).collect::<Vec<f64>>();
    let mut xy = spec(XVALS, FLOAT, one(a.clone()));
    xy.x = Some(grid.clone());
    let mut xyxy = spec(XVALS | XYXY | MULTI, FLOAT, vec![]);
    xyxy.subs = vec![
        SubSpec {
            x: Some(grid.clone()),
            y: a.clone(),
        },
        SubSpec {
            x: Some(grid[..90].to_vec()),
            y: a[..90].to_vec(),
        },
    ];
    let mut t = spec(
        0,
        FLOAT,
        one(a.iter().map(|v| 100.0 * 10f64.powf(-v)).collect()),
    );
    t.y_type = 128;
    let mut old = spec(0, FLOAT, one(a.clone()));
    old.version = 0x4D;
    vec![
        ("float32", spec(0, FLOAT, one(a.clone()))),
        ("int32", spec(0, 2, one(a.clone()))),
        ("int16", spec(Y16, 2, one(a.clone()))),
        ("xvalues", xy),
        (
            "multi",
            spec(
                MULTI,
                FLOAT,
                [one(a.clone()), one(scaled(0.5)), one(scaled(0.25))].concat(),
            ),
        ),
        ("xyxy", xyxy),
        ("transmittance", t),
        ("old_format", old),
    ]
}

fn put(b: &mut [u8], at: usize, v: &[u8]) {
    b[at..at + v.len()].copy_from_slice(v);
}

fn f32s(v: &[f64]) -> Vec<u8> {
    v.iter().flat_map(|&x| (x as f32).to_le_bytes()).collect()
}

fn ints(y: &[f64], exp: u8, wide: bool) -> Vec<u8> {
    let bits = if wide { 32 } else { 16 };
    let scale = 2f64.powi(bits - i32::from(exp as i8));
    y.iter()
        .flat_map(|&v| {
            let r = (v * scale).round();
            if wide {
                (r as i32).to_le_bytes().to_vec()
            } else {
                (r as i16).to_le_bytes().to_vec()
            }
        })
        .collect()
}

/// The bytes of the file.
pub fn build(s: &SpcSpec) -> Vec<u8> {
    let first_n = s.subs.first().map_or(0, |u| u.y.len());
    let mut out = vec![0u8; 512];
    out[0] = s.flags;
    out[1] = s.version;
    out[3] = s.exp;
    let npts = if s.flags & XYXY != 0 { 0 } else { first_n };
    put(&mut out, 4, &(npts as u32).to_le_bytes());
    put(&mut out, 8, &s.first.to_le_bytes());
    put(&mut out, 16, &s.last.to_le_bytes());
    put(&mut out, 24, &(s.subs.len() as u32).to_le_bytes());
    out[28] = s.x_type;
    out[29] = s.y_type;
    put(&mut out, 32, &DATE.to_le_bytes());
    put(&mut out, 88, COMMENT.as_bytes());
    if let Some(x) = &s.x {
        out.extend(f32s(x));
    }
    for sub in &s.subs {
        let mut head = vec![0u8; 32];
        head[1] = s.exp;
        put(&mut head, 16, &(sub.y.len() as u32).to_le_bytes());
        out.extend(head);
        if let Some(x) = &sub.x {
            out.extend(f32s(x));
        }
        if s.exp == FLOAT {
            out.extend(f32s(&sub.y));
        } else {
            out.extend(ints(&sub.y, s.exp, s.flags & Y16 == 0));
        }
    }
    out
}
