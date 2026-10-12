//! Builds the spectra of one block: axes from the labels, ordinates from the tables, and the declared-value checks.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::asdf::{self, Forms};
use super::meta;
use super::text::{Item, Ldr, DATA_LABELS};
use crate::readers::model::{
    Limits, Order, ReadError, ReadResult, Role, Severity, Spectrum, Warning, XAxis, XUnit, XValues,
    YAxis, YUnit,
};

/// A number from a label with the unit of its last printed digit (writers round or truncate).
#[derive(Debug, Clone, Copy)]
struct Num {
    v: f64,
    tol: f64,
}

fn parse_num(text: &str) -> Option<Num> {
    let t = text.trim();
    let v = t.parse::<f64>().ok().filter(|v| v.is_finite())?;
    let (mant, exp) = match t.split_once(['E', 'e']) {
        Some((m, e)) => (m, e.parse::<i32>().ok()?),
        None => (t, 0),
    };
    let frac = mant.split_once('.').map_or(0, |(_, f)| f.len());
    let dec = i32::try_from(frac).unwrap_or(0) - exp;
    Some(Num {
        v,
        tol: 10f64.powi(-dec),
    })
}

struct Block<'a> {
    items: &'a [Item],
}

impl Block<'_> {
    fn ldr(&self, label: &str) -> Option<&Ldr> {
        self.items.iter().find_map(|i| match i {
            Item::Ldr(l) if l.label == label => Some(l),
            _ => None,
        })
    }

    fn text(&self, label: &str) -> String {
        self.ldr(label).map(Ldr::full_value).unwrap_or_default()
    }

    fn num(&self, label: &'static str) -> ReadResult<Option<Num>> {
        match self.ldr(label) {
            None => Ok(None),
            Some(l) if l.value.trim().is_empty() => Ok(None),
            Some(l) => parse_num(&l.value).map(Some).ok_or_else(|| {
                ReadError::new("reader.jcamp.bad_number")
                    .with("key", label)
                    .with("line", l.line)
            }),
        }
    }
}

fn caution(key: &'static str) -> Warning {
    Warning::new(key, Severity::Caution)
}

/// Spectra of one non-link block plus the compression forms its tables used.
pub struct Built {
    pub spectra: Vec<Spectrum>,
    pub forms: Forms,
}

pub fn build(items: &[Item], limits: &Limits) -> ReadResult<Built> {
    let blk = Block { items };
    let tables: Vec<&Ldr> = items
        .iter()
        .filter_map(|i| match i {
            Item::Ldr(l) if DATA_LABELS.contains(&l.label.as_str()) => Some(l),
            _ => None,
        })
        .collect();
    if tables.is_empty() {
        let ntuples = blk.ldr("NTUPLES").is_some();
        return Err(ReadError::new(if ntuples {
            "reader.jcamp.ntuples_unsupported"
        } else {
            "reader.jcamp.no_data"
        }));
    }
    let mut out = Built {
        spectra: Vec::new(),
        forms: Forms::default(),
    };
    for t in tables {
        let (s, f) = build_one(&blk, t, limits)?;
        out.forms.sqz |= f.sqz;
        out.forms.dif |= f.dif;
        out.forms.dup |= f.dup;
        out.forms.pac |= f.pac;
        out.spectra.push(s);
    }
    Ok(out)
}

fn compact(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_uppercase()
}

fn build_one(blk: &Block, table: &Ldr, limits: &Limits) -> ReadResult<(Spectrum, Forms)> {
    let xf = blk.num("XFACTOR")?.map_or(1.0, |n| n.v);
    let yf_num = blk.num("YFACTOR")?;
    let yf = yf_num.map_or(1.0, |n| n.v);
    let head = compact(&table.value);
    let mut warnings: Vec<Warning> = Vec::new();
    let mut forms = Forms::default();
    let (x, y, group_w): (XValues, Vec<f64>, Vec<f64>);
    if head.starts_with("(X++") {
        let d = asdf::decode_xydata(&table.cont, limits.max_points)?;
        forms = d.forms;
        for c in &d.check_failures {
            warnings.push(
                caution("reader.jcamp.y_check")
                    .with("line", c.line)
                    .with("expected", c.expected)
                    .with("found", c.found),
            );
        }
        let ys: Vec<f64> = d.y.iter().map(|v| v * yf).collect();
        x = regular_axis(blk, &d, xf, ys.len(), &mut warnings)?;
        y = ys;
        group_w = Vec::new();
    } else if head.starts_with("(XY") {
        let width = if head.starts_with("(XYW") { 3 } else { 2 };
        let (xs, ys, ws) = pairs(table, width, xf, yf, limits.max_points)?;
        if let Some(n) = blk.num("NPOINTS")? {
            if n.v != ys.len() as f64 {
                warnings.push(npoints(n.v, ys.len()));
            }
        }
        x = XValues::Explicit(xs);
        y = ys;
        group_w = ws;
    } else {
        return Err(ReadError::new("reader.jcamp.table_unsupported")
            .with("line", table.line)
            .with("form", &table.value));
    }
    if y.is_empty() {
        return Err(ReadError::new("reader.jcamp.no_data"));
    }
    declared_checks(blk, &y, yf_num.map(|n| n.v), &mut warnings)?;
    let order = order_of(&x);
    let peaks = table.label == "PEAKTABLE";
    if peaks {
        warnings.push(Warning::new("reader.jcamp.peaks_only", Severity::Info));
    }
    let interferogram = compact(&blk.text("DATATYPE")).contains("INTERFEROGRAM");
    let xu = x_unit(blk, interferogram, &mut warnings);
    let yu = y_unit(blk, interferogram, &y, &mut warnings);
    let mut fields = meta::fields_of(blk.items);
    if fields.len() > limits.max_fields {
        return Err(ReadError::limit("fields", limits.max_fields));
    }
    if !group_w.is_empty() {
        fields.push(widths_field(table, &group_w));
    }
    if let Some(w) = meta::unknown_warning(&fields) {
        warnings.push(w);
    }
    let (instrument, measurement) = meta::standard(&mut fields, &mut warnings);
    let spectrum = Spectrum {
        role: if peaks {
            Role::Processed
        } else {
            Role::Unknown
        },
        x: XAxis {
            unit: xu,
            order,
            values: x,
        },
        y: YAxis {
            unit: yu,
            values: y,
            quantum: yf_num.map(|n| n.v),
        },
        instrument,
        measurement,
        history: Vec::new(),
        fields,
        warnings,
    };
    Ok((spectrum, forms))
}

fn widths_field(table: &Ldr, w: &[f64]) -> crate::readers::model::Field {
    use crate::readers::model::{Field, FieldKind};
    Field {
        origin: format!("line {} ##{} (W column)", table.line, table.raw_label),
        key: "PEAKWIDTHS".to_string(),
        original_key: "W".to_string(),
        value: w.iter().map(f64::to_string).collect::<Vec<_>>().join(","),
        kind: FieldKind::Text,
        unit: None,
        mapped: None,
        identity: false,
        known: true,
    }
}

fn npoints(expected: f64, found: usize) -> Warning {
    caution("reader.jcamp.npoints_mismatch")
        .with("expected", expected)
        .with("found", found)
}

/// Numbers of an `(XY..XY)` or `(XYW..XYW)` table: x, y and (for three columns) the width.
fn pairs(
    table: &Ldr,
    width: usize,
    xf: f64,
    yf: f64,
    max_points: usize,
) -> ReadResult<(Vec<f64>, Vec<f64>, Vec<f64>)> {
    let mut nums: Vec<f64> = Vec::new();
    for (line, text) in &table.cont {
        for tok in text.split(|c: char| c.is_whitespace() || c == ',' || c == ';') {
            if tok.is_empty() {
                continue;
            }
            let v = tok
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
                .ok_or_else(|| ReadError::new("reader.jcamp.bad_data").with("line", *line))?;
            nums.push(v);
            if nums.len() > max_points.saturating_mul(width) {
                return Err(ReadError::limit("points", max_points));
            }
        }
    }
    if !nums.len().is_multiple_of(width) {
        return Err(ReadError::new("reader.jcamp.bad_data").with("line", table.line));
    }
    let (mut xs, mut ys, mut ws) = (Vec::new(), Vec::new(), Vec::new());
    for g in nums.chunks_exact(width) {
        xs.push(g.first().copied().unwrap_or(0.0) * xf);
        ys.push(g.get(1).copied().unwrap_or(0.0) * yf);
        if width == 3 {
            ws.push(g.get(2).copied().unwrap_or(0.0));
        }
    }
    Ok((xs, ys, ws))
}

/// Regular axis from FIRSTX, LASTX and the number of points actually read.
fn regular_axis(
    blk: &Block,
    d: &asdf::Decoded,
    xf: f64,
    n: usize,
    warnings: &mut Vec<Warning>,
) -> ReadResult<XValues> {
    let firstx = blk.num("FIRSTX")?;
    let lastx = blk.num("LASTX")?;
    let deltax = blk.num("DELTAX")?;
    if let Some(np) = blk.num("NPOINTS")? {
        if np.v != n as f64 {
            warnings.push(npoints(np.v, n));
        }
    }
    let row_step = row_step(d, xf);
    let declared_ok = blk.num("NPOINTS")?.is_none_or(|np| np.v == n as f64);
    let axis = match (firstx, lastx) {
        (Some(f), Some(l)) if declared_ok || row_step.is_none() => (f.v, l.v),
        (f, _) => {
            let step = row_step.or(deltax.map(|x| x.v));
            let first = f.map(|f| f.v).or(d.rows.first().map(|r| r.x * xf));
            match (first, step) {
                (Some(first), Some(step)) => (first, first + step * n.saturating_sub(1) as f64),
                _ => return Err(ReadError::new("reader.jcamp.axis_missing")),
            }
        }
    };
    let (first, last) = axis;
    let step = if n > 1 {
        (last - first) / (n - 1) as f64
    } else {
        0.0
    };
    axis_checks(d, xf, (first, step), deltax, warnings);
    Ok(XValues::Regular { first, last, n })
}

/// Point spacing from the line abscissae (first and last line), if they give one.
fn row_step(d: &asdf::Decoded, xf: f64) -> Option<f64> {
    let (a, b) = (d.rows.first()?, d.rows.last()?);
    let pts = b.start.checked_sub(a.start).filter(|p| *p > 0)?;
    Some((b.x - a.x) * xf / pts as f64)
}

fn axis_checks(
    d: &asdf::Decoded,
    xf: f64,
    (first, step): (f64, f64),
    deltax: Option<Num>,
    warnings: &mut Vec<Warning>,
) {
    let rounded = d.rows.iter().all(|r| (r.x - r.x.round()).abs() < 1e-12);
    let tol = step.abs().max(if rounded { 0.5 + 1e-9 } else { 1e-9 });
    let bad: Vec<&asdf::Row> = d
        .rows
        .iter()
        .filter(|r| (r.x * xf - (first + step * r.start as f64)).abs() > tol)
        .collect();
    if let Some(r) = bad.first() {
        warnings.push(
            caution("reader.jcamp.x_check")
                .with("count", bad.len())
                .with("line", r.line),
        );
    }
    if let Some(dx) = deltax {
        let drift = (dx.v.abs() - step.abs()).abs() * d.y.len().saturating_sub(1) as f64;
        if drift > step.abs() + dx.tol * d.y.len() as f64 {
            warnings.push(
                caution("reader.jcamp.deltax_mismatch")
                    .with("expected", dx.v)
                    .with("found", step),
            );
        }
    }
}

/// FIRSTY, MINY and MAXY against the ordinates read (tolerance: file quantum plus printed rounding).
fn declared_checks(
    blk: &Block,
    y: &[f64],
    quantum: Option<f64>,
    warnings: &mut Vec<Warning>,
) -> ReadResult<()> {
    let min = y.iter().copied().fold(f64::INFINITY, f64::min);
    let max = y.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let checks = [
        ("FIRSTY", y.first().copied().unwrap_or(0.0)),
        ("MINY", min),
        ("MAXY", max),
    ];
    for (label, found) in checks {
        if let Some(n) = blk.num(label)? {
            // The relative term covers writers that print 32-bit floats.
            let tol = n.tol + quantum.unwrap_or(0.0) + 1.2e-7 * found.abs();
            if (n.v - found).abs() > tol {
                warnings.push(
                    caution("reader.jcamp.value_check")
                        .with("key", label)
                        .with("expected", n.v)
                        .with("found", found),
                );
            }
        }
    }
    Ok(())
}

fn order_of(x: &XValues) -> Order {
    match x {
        XValues::Regular { first, last, .. } => {
            if last < first {
                Order::Descending
            } else {
                Order::Ascending
            }
        }
        XValues::Explicit(v) => {
            if v.windows(2).all(|w| w.first() <= w.get(1)) {
                Order::Ascending
            } else if v.windows(2).all(|w| w.first() >= w.get(1)) {
                Order::Descending
            } else {
                Order::Unordered
            }
        }
    }
}

fn x_unit(blk: &Block, interferogram: bool, warnings: &mut Vec<Warning>) -> XUnit {
    let raw = blk.text("XUNITS");
    match compact(&raw).as_str() {
        "1/CM" => XUnit::Cm1,
        "MICROMETERS" => XUnit::Um,
        "NANOMETERS" => XUnit::Nm,
        "CM" => XUnit::Cm,
        "ARBITRARYUNITS" | "POINTS" => XUnit::Points,
        _ => {
            let _ = interferogram;
            warnings.push(caution("reader.jcamp.xunits_unknown").with("value", raw));
            XUnit::Points
        }
    }
}

fn y_unit(blk: &Block, interferogram: bool, y: &[f64], warnings: &mut Vec<Warning>) -> YUnit {
    if interferogram {
        return YUnit::Interferogram;
    }
    let raw = blk.text("YUNITS");
    match compact(&raw).replace(['-', '_'], "").as_str() {
        "ABSORBANCE" => YUnit::Absorbance,
        "REFLECTANCE" => YUnit::Reflectance,
        "KUBELKAMUNK" => YUnit::KubelkaMunk,
        "LOG(1/R)" => YUnit::LogInvR,
        "SINGLEBEAM" => YUnit::SingleBeam,
        "ARBITRARYUNITS" => YUnit::Arbitrary,
        "TRANSMITTANCE" => {
            let max = y.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            if max <= 1.5 {
                YUnit::TransmittanceFraction
            } else if max <= 150.0 {
                YUnit::TransmittancePercent
            } else {
                warnings.push(caution("reader.jcamp.transmittance_range").with("max", max));
                YUnit::Unknown
            }
        }
        _ => {
            warnings.push(caution("reader.jcamp.yunits_unknown").with("value", raw));
            YUnit::Unknown
        }
    }
}
