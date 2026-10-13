//! The spectrum header (section 2): number of points, unit codes and first and last x.
use super::super::le::{f32_at, slice, u32_at};
use super::super::model::{ReadError, ReadResult, Severity, Warning, XUnit, YUnit};

pub struct Info {
    pub n: usize,
    pub x_unit: XUnit,
    pub y_unit: YUnit,
    pub first: f64,
    pub last: f64,
    pub x_code: u8,
    pub y_code: u8,
}

fn bad(why: &str) -> ReadError {
    ReadError::new("reader.spa.bad_data").with("why", why)
}

/// Unit code of x (byte 8). The code of a Raman shift is not an infrared wavenumber: refused.
fn x_unit(code: u8) -> ReadResult<XUnit> {
    match code {
        1 => Ok(XUnit::Cm1),
        2 => Ok(XUnit::Points),
        3 => Ok(XUnit::Nm),
        4 => Ok(XUnit::Um),
        other => Err(ReadError::new("reader.spa.x_unit").with("value", other)),
    }
}

/// Unit code of y (byte 12); a code that is not listed is `Unknown` with a warning, never guessed.
fn y_unit(code: u8, warnings: &mut Vec<Warning>) -> YUnit {
    match code {
        0x11 => YUnit::Absorbance,
        0x10 => YUnit::TransmittancePercent,
        0x0B => YUnit::Reflectance,
        0x0C => YUnit::KubelkaMunk,
        0x0F => YUnit::SingleBeam,
        0x16 => YUnit::Interferogram,
        other => {
            warnings.push(
                Warning::new("reader.spa.yunits_unknown", Severity::Caution).with("value", other),
            );
            YUnit::Unknown
        }
    }
}

pub fn parse(sec: &[u8], warnings: &mut Vec<Warning>) -> ReadResult<Info> {
    let head = slice(sec, 0, 24).ok_or_else(|| bad("header"))?;
    let x_code = *head.get(8).ok_or_else(|| bad("header"))?;
    let y_code = *head.get(12).ok_or_else(|| bad("header"))?;
    let (Some(nx), Some(first), Some(last)) = (u32_at(head, 4), f32_at(head, 16), f32_at(head, 20))
    else {
        return Err(bad("header"));
    };
    Ok(Info {
        n: super::super::le::size(nx),
        x_unit: x_unit(x_code)?,
        y_unit: y_unit(y_code, warnings),
        first: f64::from(first),
        last: f64::from(last),
        x_code,
        y_code,
    })
}
