//! Synthetic Thermo OMNIC `.spa` files with their truth: invented title, date and history, Lorentz bands from `synthetic`.
//! Same layout the reader decodes (section table at byte 304, header section 2, float32 data section 3).
use crate::synthetic::{generate, Band, Params};

/// What a synthetic file holds; the tests compare the reader's answer with these values.
#[derive(Debug, Clone)]
pub struct SpaSpec {
    pub title: &'static str,
    /// Seconds since 1899-12-31 (0 = no date).
    pub omnic_seconds: u32,
    pub x_code: u8,
    pub y_code: u8,
    pub first: f32,
    pub last: f32,
    pub y: Vec<f32>,
    pub comment: &'static str,
    pub history: &'static str,
    /// Adds the library text section (its date means nothing).
    pub library: bool,
}

/// 2026-03-14 12:00:00 UTC.
pub const OMNIC_SECONDS: u32 = 1_773_489_600 + 2_209_075_200;
pub const TITLE: &str = "synthetic sample 0001";
pub const COMMENT: &str = "invented comment";
pub const HISTORY: &str = "Collected by nobody";

/// Absorbance of five invented bands on a 181-point grid from 4000 to 400 cm⁻¹.
pub fn absorbance() -> Vec<f64> {
    let p = Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
        step_cm1: 20.0,
        bands: [
            (2920.0, 25.0, 0.8),
            (1715.0, 12.0, 1.0),
            (1450.0, 15.0, 0.4),
            (1100.0, 30.0, 0.6),
            (700.0, 10.0, 0.3),
        ]
        .iter()
        .map(|&(center_cm1, half_width_cm1, height)| Band {
            center_cm1,
            half_width_cm1,
            height,
        })
        .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.05,
        noise: 0.002,
        seed: 7,
    };
    generate(&p).y
}

fn base(y_code: u8, y: Vec<f32>) -> SpaSpec {
    SpaSpec {
        title: TITLE,
        omnic_seconds: OMNIC_SECONDS,
        x_code: 1,
        y_code,
        first: 4000.0,
        last: 400.0,
        y,
        comment: COMMENT,
        history: HISTORY,
        library: false,
    }
}

/// The committed fixtures `(name, spec)`.
pub fn fixtures() -> Vec<(&'static str, SpaSpec)> {
    let a: Vec<f32> = absorbance().iter().map(|&v| v as f32).collect();
    let t: Vec<f32> = absorbance()
        .iter()
        .map(|&v| (100.0 * 10f64.powf(-v)) as f32)
        .collect();
    let mut library = base(0x11, a.clone());
    library.library = true;
    vec![
        ("absorbance", base(0x11, a)),
        ("transmittance", base(0x10, t)),
        ("library", library),
    ]
}

fn put32(b: &mut [u8], at: usize, v: u32) {
    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
}

/// The bytes of the file.
pub fn build(s: &SpaSpec) -> Vec<u8> {
    let mut info = vec![0u8; 60];
    info[0] = 2;
    put32(&mut info, 4, s.y.len() as u32);
    info[8] = s.x_code;
    info[12] = s.y_code;
    info[16..20].copy_from_slice(&s.first.to_le_bytes());
    info[20..24].copy_from_slice(&s.last.to_le_bytes());
    let data: Vec<u8> = s.y.iter().flat_map(|v| v.to_le_bytes()).collect();
    let text = |t: &str| {
        let mut v = t.as_bytes().to_vec();
        v.push(0);
        v
    };
    let mut sections: Vec<(u8, Vec<u8>)> = vec![
        (2, info),
        (3, data),
        (4, text(s.comment)),
        (27, text(s.history)),
    ];
    if s.library {
        sections.push((0x53, text("library text")));
    }
    let mut out = vec![0u8; 304 + 16 * sections.len() + 16];
    out[..18].copy_from_slice(b"Spectral Data File");
    out[30..30 + s.title.len()].copy_from_slice(s.title.as_bytes());
    out[294..296].copy_from_slice(&(sections.len() as u16).to_le_bytes());
    put32(&mut out, 296, s.omnic_seconds);
    for (i, (key, body)) in sections.iter().enumerate() {
        let rec = 304 + 16 * i;
        out[rec] = *key;
        let pos = out.len() as u32;
        put32(&mut out, rec + 2, pos);
        put32(&mut out, rec + 6, body.len() as u32);
        out.extend_from_slice(body);
    }
    out
}
