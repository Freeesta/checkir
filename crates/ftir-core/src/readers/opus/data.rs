//! Data blocks: float32 series with the axis from the parameters `NPT`, `FXV`, `LXV`, `DXU` and the scale `CSF`.
use super::directory::Kind;
use super::params::{Param, Value};
use crate::readers::model::{
    Instrument, Limits, Measurement, Order, ReadError, ReadResult, Role, Spectrum, XAxis, XUnit,
    XValues, YAxis, YUnit,
};

fn bad(why: &str) -> ReadError {
    ReadError::new("reader.opus.bad_data").with("why", why)
}

pub fn get<'a>(params: &'a [Param], name: &str) -> Option<&'a Value> {
    params.iter().find(|p| p.name == name).map(|p| &p.value)
}

pub fn number(params: &[Param], name: &str) -> Option<f64> {
    match get(params, name)? {
        Value::Int(v) => Some(f64::from(*v)),
        Value::Real(v) => Some(*v),
        _ => None,
    }
}

fn text<'a>(params: &'a [Param], name: &str) -> Option<&'a str> {
    match get(params, name)? {
        Value::Text(t) => Some(t.trim()),
        _ => None,
    }
}

fn x_unit(params: &[Param]) -> ReadResult<XUnit> {
    let t = text(params, "DXU").unwrap_or("");
    match t.to_ascii_uppercase().as_str() {
        "WN" => Ok(XUnit::Cm1),
        "MI" | "MIC" => Ok(XUnit::Um),
        "NM" => Ok(XUnit::Nm),
        "PNT" => Ok(XUnit::Points),
        _ => Err(ReadError::new("reader.opus.x_unit_unknown").with("value", t)),
    }
}

fn count(params: &[Param], limits: &Limits) -> ReadResult<usize> {
    let Some(Value::Int(v)) = get(params, "NPT") else {
        return Err(bad("NPT"));
    };
    let n = usize::try_from(*v).map_err(|_| bad("NPT"))?;
    if n > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    if n < 2 {
        return Err(bad("NPT"));
    }
    Ok(n)
}

/// The axis of a series. The reader does not convert or reorder: the order is the file's.
pub fn axis(params: &[Param], limits: &Limits) -> ReadResult<XAxis> {
    let n = count(params, limits)?;
    let first = number(params, "FXV").ok_or_else(|| bad("FXV"))?;
    let last = number(params, "LXV").ok_or_else(|| bad("LXV"))?;
    if !first.is_finite() || !last.is_finite() || first == last {
        return Err(bad("range"));
    }
    Ok(XAxis {
        unit: x_unit(params)?,
        order: if first < last {
            Order::Ascending
        } else {
            Order::Descending
        },
        values: XValues::Regular { first, last, n },
    })
}

/// The values of a series: `n` float32 numbers times the scale `CSF`. Only the declared points are read.
pub fn values(chunk: &[u8], n: usize, params: &[Param]) -> ReadResult<Vec<f64>> {
    if let Some(v) = number(params, "DPF") {
        if v != 1.0 {
            return Err(ReadError::new("reader.opus.data_format").with("value", v));
        }
    }
    let scale = match number(params, "CSF") {
        Some(s) if s.is_finite() && s > 0.0 => s,
        _ => 1.0,
    };
    let need = n.checked_mul(4).ok_or_else(|| bad("length"))?;
    let body = chunk.get(..need).ok_or_else(|| bad("length"))?;
    let y: Vec<f64> = body
        .chunks_exact(4)
        .filter_map(|c| <[u8; 4]>::try_from(c).ok())
        .map(|c| f64::from(f32::from_le_bytes(c)) * scale)
        .collect();
    if y.len() != n || y.iter().any(|v| !v.is_finite()) {
        return Err(bad("values"));
    }
    Ok(y)
}

fn role_unit(kind: Kind) -> Option<(Role, YUnit)> {
    match kind {
        Kind::Ab => Some((Role::Sample, YUnit::Absorbance)),
        Kind::ScSm => Some((Role::Sample, YUnit::SingleBeam)),
        Kind::ScRf => Some((Role::Background, YUnit::SingleBeam)),
        Kind::IgSm => Some((Role::SampleInterferogram, YUnit::Interferogram)),
        Kind::IgRf => Some((Role::BackgroundInterferogram, YUnit::Interferogram)),
        Kind::PhSm => None,
    }
}

fn spectrum(role: Role, unit: YUnit, x: XAxis, y: Vec<f64>) -> Spectrum {
    Spectrum {
        role,
        x,
        y: YAxis {
            unit,
            values: y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: Vec::new(),
        fields: Vec::new(),
        warnings: Vec::new(),
    }
}

/// The spectrum of one data block; the phase has none.
pub fn build(kind: Kind, chunk: &[u8], params: &[Param], limits: &Limits) -> ReadResult<Spectrum> {
    let (role, unit) = role_unit(kind).ok_or_else(|| bad("kind"))?;
    let x = axis(params, limits)?;
    let y = values(chunk, x.values.len(), params)?;
    Ok(spectrum(role, unit, x, y))
}

/// Absorbance `-log10(sample / background)` of two single-channel spectra on the same axis.
pub fn absorbance(sample: &Spectrum, background: &Spectrum) -> ReadResult<Spectrum> {
    if sample.x != background.x {
        return Err(ReadError::new("reader.opus.axis_mismatch"));
    }
    let y: Vec<f64> = sample
        .y
        .values
        .iter()
        .zip(&background.y.values)
        .map(|(s, r)| -(s / r).log10())
        .collect();
    if y.iter().any(|v| !v.is_finite()) {
        return Err(bad("ratio"));
    }
    Ok(spectrum(
        Role::Sample,
        YUnit::Absorbance,
        sample.x.clone(),
        y,
    ))
}
