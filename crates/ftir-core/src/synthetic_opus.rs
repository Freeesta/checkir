//! Synthetic Bruker OPUS files with known truth: float32 series, parameter lists and a directory, built byte by byte.
//! The data blocks come last, so every shorter prefix of a file lacks its main series.
use crate::synthetic::{generate, Params};

/// Values the anonymity tests look for in every export.
pub const SAMPLE: &str = "Case 4711 powder";
pub const OPERATOR: &str = "Giulia Neri";
pub const PATH: &str = "C:\\Users\\gneri\\Data\\kitchen-table-9";
pub const SERIAL: &str = "SN-1234567";
pub const HISTORY: &str = "Measured by gneri at Servizio Alfa";

/// One float32 series on a regular axis.
#[derive(Debug, Clone, PartialEq)]
pub struct Series {
    pub first: f64,
    pub last: f64,
    pub y: Vec<f32>,
    /// `DXU` of the file: `WN`, `MI`, `PNT`…
    pub x_unit: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Spec {
    pub ab: Option<Series>,
    pub sc_sm: Option<Series>,
    pub sc_rf: Option<Series>,
    pub resolution: f64,
    pub scans: i32,
    pub csf: f64,
}

impl Spec {
    /// An absorbance spectrum from the synthetic generator (values rounded to float32 as the file stores them).
    pub fn from_params(p: &Params) -> Spec {
        let s = generate(p);
        let first = s.wavenumber_cm1.first().copied().unwrap_or(0.0);
        let last = s.wavenumber_cm1.last().copied().unwrap_or(0.0);
        Spec {
            ab: Some(Series {
                first,
                last,
                y: s.y.iter().map(|v| *v as f32).collect(),
                x_unit: "WN",
            }),
            sc_sm: None,
            sc_rf: None,
            resolution: 4.0,
            scans: 32,
            csf: 1.0,
        }
    }

    /// Single-channel sample and background only (no `AB`), from a background with a smooth shape and an absorbance.
    pub fn single_channel(p: &Params) -> Spec {
        let mut spec = Spec::from_params(p);
        let ab = spec.ab.take().unwrap_or_else(|| unreachable!());
        let rf: Vec<f32> = (0..ab.y.len()).map(|i| 1000.0 + i as f32).collect();
        let sm: Vec<f32> =
            ab.y.iter()
                .zip(&rf)
                .map(|(a, r)| r * 10f32.powf(-*a))
                .collect();
        spec.sc_rf = Some(Series {
            y: rf,
            ..ab.clone()
        });
        spec.sc_sm = Some(Series { y: sm, ..ab });
        spec
    }
}

fn pad4(v: &mut Vec<u8>) {
    while !v.len().is_multiple_of(4) {
        v.push(0);
    }
}

fn record(name: &str, kind: u16, payload: &[u8], out: &mut Vec<u8>) {
    let mut n = name.as_bytes().to_vec();
    n.resize(3, b' ');
    out.extend_from_slice(&n);
    out.push(0);
    out.extend_from_slice(&kind.to_le_bytes());
    let mut p = payload.to_vec();
    if !p.len().is_multiple_of(2) {
        p.push(0);
    }
    out.extend_from_slice(&u16::try_from(p.len() / 2).unwrap_or(0).to_le_bytes());
    out.extend_from_slice(&p);
}

/// A parameter value of a synthetic block.
pub enum P<'a> {
    Int(i32),
    Real(f64),
    Text(&'a str),
}

/// The bytes of a parameter block, `END` included.
pub fn param_block(list: &[(&str, P<'_>)]) -> Vec<u8> {
    let mut out = Vec::new();
    for (name, v) in list {
        match v {
            P::Int(i) => record(name, 0, &i.to_le_bytes(), &mut out),
            P::Real(r) => record(name, 1, &r.to_le_bytes(), &mut out),
            P::Text(t) => {
                let mut b = t
                    .chars()
                    .map(|c| u8::try_from(c as u32).unwrap_or(b'?'))
                    .collect::<Vec<_>>();
                b.push(0);
                record(name, 2, &b, &mut out)
            }
        }
    }
    record("END", 0, &[], &mut out);
    pad4(&mut out);
    out
}

fn series_bytes(s: &Series) -> Vec<u8> {
    s.y.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn data_params(s: &Series, csf: f64) -> Vec<u8> {
    param_block(&[
        ("DPF", P::Int(1)),
        ("NPT", P::Int(i32::try_from(s.y.len()).unwrap_or(0))),
        ("FXV", P::Real(s.first)),
        ("LXV", P::Real(s.last)),
        ("CSF", P::Real(csf)),
        ("MXY", P::Real(2.0)),
        ("MNY", P::Real(0.0)),
        ("DAT", P::Text("15/03/2019")),
        ("TIM", P::Text("09:12:34.123 (GMT+1)")),
        ("DXU", P::Text(s.x_unit)),
    ])
}

/// One directory entry: data type, channel, text type and the bytes of the block.
pub type RawBlock = (u8, u8, u8, Vec<u8>);

/// Header, directory and blocks, in the order given. The directory is padded to 504 bytes like the files of the instrument.
pub fn assemble(blocks: &[RawBlock]) -> Vec<u8> {
    let dir_end = 24 + 12 * blocks.len();
    let mut at = dir_end.max(504);
    let mut out = vec![0u8; at];
    out[..4].copy_from_slice(&[0x0a, 0x0a, 0xfe, 0xfe]);
    out[4..12].copy_from_slice(&20.0f64.to_le_bytes());
    out[12..16].copy_from_slice(&24u32.to_le_bytes());
    out[16..20].copy_from_slice(&u32::try_from((at - 24) / 12).unwrap_or(0).to_le_bytes());
    out[20..24].copy_from_slice(&u32::try_from(blocks.len()).unwrap_or(0).to_le_bytes());
    for (i, (dt, ch, tt, body)) in blocks.iter().enumerate() {
        let e = 24 + 12 * i;
        out[e..e + 3].copy_from_slice(&[*dt, *ch, *tt]);
        let words = u32::try_from(body.len() / 4).unwrap_or(0);
        out[e + 4..e + 8].copy_from_slice(&words.to_le_bytes());
        out[e + 8..e + 12].copy_from_slice(&u32::try_from(at).unwrap_or(0).to_le_bytes());
        out.extend_from_slice(body);
        at += body.len();
    }
    out
}

/// The blocks of a file for `spec`; parameter blocks first, data blocks last.
pub fn blocks(spec: &Spec) -> Vec<RawBlock> {
    let mut b: Vec<RawBlock> = vec![
        (
            32,
            0,
            0,
            param_block(&[
                ("INS", P::Text("VERTEX 70")),
                ("SRN", P::Text(SERIAL)),
                ("LWN", P::Real(15798.0)),
            ]),
        ),
        (
            48,
            0,
            0,
            param_block(&[
                ("RES", P::Real(spec.resolution)),
                ("NSS", P::Int(spec.scans)),
                ("AQM", P::Text("DD")),
            ]),
        ),
        (
            64,
            0,
            0,
            param_block(&[("APF", P::Text("B3")), ("ZFF", P::Int(2))]),
        ),
        (
            160,
            0,
            0,
            param_block(&[
                ("SNM", P::Text(SAMPLE)),
                ("CNM", P::Text(OPERATOR)),
                ("XPP", P::Text(PATH)),
            ]),
        ),
        (0, 0, 104, {
            let mut h = HISTORY.as_bytes().to_vec();
            h.push(0);
            pad4(&mut h);
            h
        }),
    ];
    for (dt, ch, s) in [
        (31u8, 0u8, &spec.ab),
        (23, 4, &spec.sc_sm),
        (27, 4, &spec.sc_rf),
    ] {
        if let Some(s) = s {
            b.push((dt, ch, 0, data_params(s, spec.csf)));
        }
    }
    for (dt, ch, s) in [
        (15u8, 0u8, &spec.ab),
        (7, 4, &spec.sc_sm),
        (11, 4, &spec.sc_rf),
    ] {
        if let Some(s) = s {
            b.push((dt, ch, 0, series_bytes(s)));
        }
    }
    b
}

/// The bytes of an OPUS file for `spec`.
pub fn write(spec: &Spec) -> Vec<u8> {
    assemble(&blocks(spec))
}
