//! The 512-byte main header of an SPC file (new format, version byte 0x4B) and its unit codes.
use super::super::le::{self, f64_at, size, u32_at};
use super::super::model::{ReadError, ReadResult, Severity, Warning, XUnit, YUnit};

pub const HEADER_LEN: usize = 512;
/// `ftflgs` bits.
pub const Y16: u8 = 0x01;
pub const MULTI: u8 = 0x04;
pub const XYXY: u8 = 0x40;
pub const XVALS: u8 = 0x80;
/// `fexp` value that marks float32 intensities.
pub const FLOAT_EXP: u8 = 0x80;

pub struct Header {
    pub flags: u8,
    pub exp: u8,
    pub npts: u32,
    pub first: f64,
    pub last: f64,
    pub nsub: u32,
    pub x_code: u8,
    pub y_code: u8,
    pub date: u32,
    pub comment: String,
}

pub fn truncated() -> ReadError {
    ReadError::new("reader.spc.truncated")
}

impl Header {
    pub fn has(&self, flag: u8) -> bool {
        self.flags & flag != 0
    }

    /// Version byte first: the old format (0x4D) and the big-endian new one (0x4C) get their own error.
    pub fn parse(file: &[u8]) -> ReadResult<Header> {
        match file.get(1) {
            Some(0x4B) => {}
            Some(0x4D) => return Err(ReadError::new("reader.spc.old_format")),
            Some(0x4C) => return Err(ReadError::new("reader.spc.big_endian")),
            _ => return Err(ReadError::new("reader.spc.not_spc")),
        }
        let h = le::slice(file, 0, HEADER_LEN).ok_or_else(truncated)?;
        let at = |o: usize| h.get(o).copied().ok_or_else(truncated);
        Ok(Header {
            flags: at(0)?,
            exp: at(3)?,
            npts: u32_at(h, 4).ok_or_else(truncated)?,
            first: f64_at(h, 8).ok_or_else(truncated)?,
            last: f64_at(h, 16).ok_or_else(truncated)?,
            nsub: u32_at(h, 24).ok_or_else(truncated)?,
            x_code: at(28)?,
            y_code: at(29)?,
            date: u32_at(h, 32).ok_or_else(truncated)?,
            comment: le::text(h.get(88..218).unwrap_or_default()),
        })
    }

    pub fn points(&self) -> usize {
        size(self.npts)
    }
}

/// x type code: wavenumber, micrometre, nanometre, data points / arbitrary, optical path in cm.
pub fn x_unit(code: u8) -> ReadResult<XUnit> {
    match code {
        1 => Ok(XUnit::Cm1),
        2 => Ok(XUnit::Um),
        3 => Ok(XUnit::Nm),
        0 | 22 | 255 => Ok(XUnit::Points),
        27 => Ok(XUnit::Cm),
        other => Err(ReadError::new("reader.spc.x_unit").with("value", other)),
    }
}

/// y type code. A transmittance is in percent or in fraction (the file does not say): decided from the largest value, as the
/// JCAMP reader does, and refused (unit unknown, with a warning) when neither fits. An unlisted code is `Unknown` with a warning.
pub fn y_unit(code: u8, y: &[f64], warnings: &mut Vec<Warning>) -> YUnit {
    match code {
        0 => YUnit::Arbitrary,
        1 => YUnit::Interferogram,
        2 => YUnit::Absorbance,
        3 => YUnit::KubelkaMunk,
        10 => YUnit::LogInvR,
        129 => YUnit::Reflectance,
        128 => {
            let max = y.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            if max <= 1.5 {
                YUnit::TransmittanceFraction
            } else if max <= 150.0 {
                YUnit::TransmittancePercent
            } else {
                warnings.push(
                    Warning::new("reader.spc.transmittance_range", Severity::Caution)
                        .with("max", max),
                );
                YUnit::Unknown
            }
        }
        other => {
            warnings.push(
                Warning::new("reader.spc.yunits_unknown", Severity::Caution).with("value", other),
            );
            YUnit::Unknown
        }
    }
}

/// Date packed in 32 bits (minute 6, hour 5, day 5, month 4, year 12): `YYYY-MM-DDTHH:MM`, or `None` when it is not a date.
pub fn date(packed: u32) -> Option<String> {
    let (minute, hour) = (packed & 63, (packed >> 6) & 31);
    let (day, month, year) = ((packed >> 11) & 31, (packed >> 16) & 15, packed >> 20);
    let ok = (1900..=2200).contains(&year)
        && (1..=12).contains(&month)
        && (1..=31).contains(&day)
        && hour < 24
        && minute < 60;
    ok.then(|| format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}"))
}
