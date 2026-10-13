//! Which objects are spectra, which one is the main spectrum, and how an object becomes a `Spectrum`.
use super::objects::{self, Header, Props};
use crate::readers::model::{
    Instrument, Limits, Measurement, Order, ReadError, ReadResult, Role, Severity, Spectrum,
    Warning, XAxis, XUnit, XValues, YAxis, YUnit,
};

/// An object of the database with the pieces needed to decide what it is.
pub struct Obj<'a, 'b> {
    pub id: u32,
    pub props: &'b Props<'a, 'b>,
    pub header: Option<Header>,
    pub x_unit: Option<String>,
    pub y_unit: Option<String>,
}

fn unit_text(v: &[u8]) -> Option<String> {
    let s = v.get(12..24.min(v.len()))?;
    let end = s.iter().position(|&b| b == 0).unwrap_or(s.len());
    std::str::from_utf8(s.get(..end)?).ok().map(str::to_string)
}

fn f64_at(b: &[u8], off: usize) -> Option<f64> {
    let s = b.get(off..off.checked_add(8)?)?;
    let mut a = [0u8; 8];
    a.copy_from_slice(s);
    Some(f64::from_le_bytes(a))
}

pub fn obj<'a, 'b>(id: u32, props: &'b Props<'a, 'b>) -> Obj<'a, 'b> {
    let text = |k: &str| props.get(k).and_then(|e| unit_text(e.value));
    Obj {
        id,
        props,
        header: props
            .get("NON_BTREE_DATA")
            .and_then(|e| objects::header(e.value)),
        x_unit: text("100001"),
        y_unit: text("100003"),
    }
}

impl Obj<'_, '_> {
    pub fn name(&self) -> Option<&str> {
        self.header.as_ref().map(|h| h.name.as_str())
    }

    pub fn has_data(&self) -> bool {
        self.props.contains_key("100008") && self.props.contains_key("100036")
    }

    /// Rule of the main spectrum: x axis in cm-1, data and range present, name not `Subtraction…`.
    pub fn is_main(&self) -> bool {
        self.has_data()
            && matches!(self.x_unit.as_deref(), Some("cm-1" | "1/cm"))
            && !self.name().is_some_and(|n| n.starts_with("Subtraction"))
    }

    /// Role from the name the instrument software gives to the object.
    pub fn role(&self) -> Role {
        match self.name() {
            Some("Interferogram") => Role::SampleInterferogram,
            Some("Background Interferogram") => Role::BackgroundInterferogram,
            Some(n) if n.starts_with("Subtraction") => Role::Subtraction,
            _ => Role::Unknown,
        }
    }
}

fn units(o: &Obj<'_, '_>, x: XUnit) -> (YUnit, Option<Warning>) {
    match (o.y_unit.as_deref(), x) {
        (Some("E"), XUnit::Cm) => (YUnit::Interferogram, None),
        (Some("E"), _) => (YUnit::SingleBeam, None),
        (Some("Abs"), _) => (YUnit::Absorbance, None),
        (Some("%T"), _) => (YUnit::TransmittancePercent, None),
        (other, _) => (
            YUnit::Unknown,
            Some(
                Warning::new("reader.ispd.yunits_unknown", Severity::Caution)
                    .with("value", other.unwrap_or("")),
            ),
        ),
    }
}

/// The spectrum of an object; `fields`, history and standard metadata are filled in by the caller.
pub fn build(o: &Obj<'_, '_>, limits: &Limits) -> ReadResult<Spectrum> {
    let bad = |why: &str| {
        ReadError::new("reader.ispd.bad_data")
            .with("object", o.id)
            .with("why", why)
    };
    let data = o.props.get("100008").ok_or_else(|| bad("data"))?;
    let range = o.props.get("100036").ok_or_else(|| bad("range"))?;
    let x_unit = match o.x_unit.as_deref() {
        Some("cm-1" | "1/cm") => XUnit::Cm1,
        Some("cm") => XUnit::Cm,
        _ => return Err(bad("x-unit")),
    };
    let n = data.value.len() / 8;
    if n > limits.max_points {
        return Err(ReadError::limit("points", limits.max_points));
    }
    if n < 2 || data.value.len() % 8 != 0 {
        return Err(bad("length"));
    }
    let y: Vec<f64> = data
        .value
        .chunks_exact(8)
        .filter_map(|ch| f64_at(ch, 0))
        .collect();
    let first = f64_at(range.value, 16).ok_or_else(|| bad("range"))?;
    let last = f64_at(range.value, 40).ok_or_else(|| bad("range"))?;
    if y.iter().any(|v| !v.is_finite()) || !first.is_finite() || !last.is_finite() || first == last
    {
        return Err(bad("values"));
    }
    let (unit, warning) = units(o, x_unit);
    Ok(Spectrum {
        role: o.role(),
        x: XAxis {
            unit: x_unit,
            order: if first < last {
                Order::Ascending
            } else {
                Order::Descending
            },
            values: XValues::Regular { first, last, n },
        },
        y: YAxis {
            unit,
            values: y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: Vec::new(),
        fields: Vec::new(),
        warnings: warning.into_iter().collect(),
    })
}

fn declared(o: &Obj<'_, '_>, key: &str) -> Option<f64> {
    let v = o.props.get(key)?.value;
    let body = v.strip_suffix(&[0]).unwrap_or(v);
    std::str::from_utf8(body).ok()?.trim().parse().ok()
}

/// Library files imported from JCAMP carry the declared minima (`##MINX`, `##MINY`): when the data disagree the
/// import changed the values (a scale factor that was not applied, a rounded axis). Values are kept as stored.
pub fn check_declared(o: &Obj<'_, '_>, s: &mut Spectrum) {
    let ys = &s.y.values;
    let ymin = ys.iter().copied().fold(f64::INFINITY, f64::min);
    if let Some(d) = declared(o, "0 ##MINY") {
        let off = (ymin - d).abs() > (1e-3 * d.abs()).max(2e-6);
        if off && ymin != 0.0 {
            s.y.unit = YUnit::Arbitrary;
            s.warnings.push(
                Warning::new("reader.ispd.y_scale", Severity::Caution)
                    .with("factor", format!("{:e}", d / ymin)),
            );
        }
    }
    if let (Some(d), XValues::Regular { first, last, n }) = (declared(o, "0 ##MINX"), &s.x.values) {
        let step = (last - first).abs() / (n.saturating_sub(1).max(1)) as f64;
        let found = first.min(*last);
        if (found - d).abs() > (step * 1e-3).max(1e-6) {
            s.warnings.push(
                Warning::new("reader.ispd.x_range", Severity::Caution)
                    .with("declared", d)
                    .with("found", found),
            );
        }
    }
}
