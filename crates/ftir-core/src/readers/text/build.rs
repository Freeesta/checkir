//! Spectra, header fields and units of a delimited text file once the reading is chosen.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::numbers::cells;
use super::Chosen;
use crate::readers::jcamp::text::normalize;
use crate::readers::model::{
    Field, FieldKind, Instrument, Limits, Measurement, Order, ReadError, ReadResult, Role,
    Severity, Spectrum, Warning, XAxis, XUnit, XValues, YAxis, YUnit,
};

pub struct Built {
    pub spectra: Vec<Spectrum>,
    pub fields: Vec<Field>,
}

/// Keys of the header that give the axis of a y-only (ASC) file; also the known keys (`tests/audit/noti_text.txt`).
/// Not confirmed on a real export yet.
pub const AXIS_KEYS: [&str; 3] = ["FIRSTX", "LASTX", "NPOINTS"];

fn caution(key: &'static str) -> Warning {
    Warning::new(key, Severity::Caution)
}

fn field(line: usize, text: &str, known_keys: &[&str]) -> Field {
    let (key, value) = match text.split_once([':', '=']) {
        Some((k, v)) if !k.trim().is_empty() && k.trim().len() <= 40 => (k.trim(), v.trim()),
        _ => ("", text.trim()),
    };
    let norm = if key.is_empty() {
        format!("line {line}")
    } else {
        normalize(key)
    };
    Field {
        origin: format!("line {line}"),
        known: known_keys.contains(&norm.as_str()),
        key: norm,
        original_key: key.to_string(),
        value: value.to_string(),
        kind: FieldKind::Text,
        unit: None,
        mapped: None,
        identity: true,
    }
}

fn header_number(fields: &[Field], key: &str) -> Option<f64> {
    let f = fields.iter().find(|f| f.key == key)?;
    f.value
        .split_whitespace()
        .next()?
        .replace(',', ".")
        .parse::<f64>()
        .ok()
}

pub fn document(c: &Chosen, limits: &Limits, warnings: &mut Vec<Warning>) -> ReadResult<Built> {
    let e = &c.eval;
    if e.first > limits.max_header_lines {
        return Err(ReadError::limit("header_lines", limits.max_header_lines));
    }
    let mut fields: Vec<Field> = c
        .lines
        .iter()
        .take(e.first)
        .map(|(n, t)| field(*n, t, &AXIS_KEYS))
        .collect();
    let names = column_names(c, &mut fields);
    for &i in &e.skipped {
        if let Some((n, t)) = c.lines.get(i) {
            let mut f = field(*n, t, &[]);
            f.key = "(SKIPPED)".to_string();
            f.known = true;
            fields.push(f);
        }
    }
    if !e.skipped.is_empty() {
        warnings.push(caution("reader.text.rows_skipped").with("count", e.skipped.len()));
    }
    if fields.len() > limits.max_fields || e.rows.len() > limits.max_points {
        return Err(ReadError::limit(
            if fields.len() > limits.max_fields {
                "fields"
            } else {
                "points"
            },
            if fields.len() > limits.max_fields {
                limits.max_fields
            } else {
                limits.max_points
            },
        ));
    }
    let spectra = if c.y_only {
        y_only(c, &fields, &names, warnings)?
    } else {
        xy(c, &names, warnings, limits)?
    };
    let unknown = fields.iter().filter(|f| !f.known).count();
    if unknown > 0 {
        warnings.push(Warning::new("reader.fields_unknown", Severity::Info).with("count", unknown));
    }
    Ok(Built { spectra, fields })
}

/// The last header line, if it has one cell per column, is the list of column names.
fn column_names(c: &Chosen, fields: &mut [Field]) -> Vec<String> {
    let last = c.eval.first.checked_sub(1).and_then(|i| c.lines.get(i));
    let Some((_, text)) = last else {
        return Vec::new();
    };
    let names: Vec<String> = cells(text, c.eval.sep)
        .iter()
        .map(|s| s.to_string())
        .collect();
    if names.len() != c.eval.columns || c.eval.columns < 2 {
        return units_of_header(c);
    }
    if let Some(f) = fields.last_mut() {
        f.mapped = Some("column.names");
        f.known = true;
    }
    names
}

/// Axis names from the `##XUNITS=` and `##YUNITS=` header lines of an instrument export (two columns only).
fn units_of_header(c: &Chosen) -> Vec<String> {
    let value = |label: &str| {
        c.lines.iter().take(c.eval.first).find_map(|(_, t)| {
            let (k, v) = t.strip_prefix("##")?.split_once('=')?;
            (normalize(k) == label).then(|| v.trim().to_string())
        })
    };
    match (value("XUNITS"), value("YUNITS")) {
        (Some(x), Some(y)) if c.eval.columns == 2 => vec![x, y],
        _ => Vec::new(),
    }
}

fn xy(
    c: &Chosen,
    names: &[String],
    warnings: &mut Vec<Warning>,
    limits: &Limits,
) -> ReadResult<Vec<Spectrum>> {
    let cols = c.eval.columns;
    if cols - 1 > limits.max_spectra {
        return Err(ReadError::limit("spectra", limits.max_spectra));
    }
    if cols > 2 {
        warnings.push(
            Warning::new("reader.text.extra_columns", Severity::Info).with("count", cols - 1),
        );
    }
    let col = |k: usize| -> Vec<f64> {
        c.eval
            .rows
            .iter()
            .filter_map(|r| r.get(k).copied())
            .collect()
    };
    let x = col(0);
    let order = if x.windows(2).all(|w| w.first() < w.get(1)) {
        Order::Ascending
    } else {
        Order::Descending
    };
    let xu = x_unit(names.first().map(String::as_str), &x, warnings);
    let mut out = Vec::new();
    for k in 1..cols {
        let y = col(k);
        let mut w = Vec::new();
        let yu = y_unit(names.get(k).map(String::as_str), &y, &mut w);
        warnings.extend(w.clone());
        out.push(spectrum(
            XAxis {
                unit: xu,
                order,
                values: XValues::Explicit(x.clone()),
            },
            YAxis {
                unit: yu,
                values: y,
                quantum: None,
            },
            w,
        ));
    }
    Ok(out)
}

fn y_only(
    c: &Chosen,
    fields: &[Field],
    names: &[String],
    warnings: &mut Vec<Warning>,
) -> ReadResult<Vec<Spectrum>> {
    let y: Vec<f64> = c.eval.rows.iter().flatten().copied().collect();
    let (Some(first), Some(last)) = (
        header_number(fields, "FIRSTX"),
        header_number(fields, "LASTX"),
    ) else {
        return Err(ReadError::new("reader.asc.axis_missing"));
    };
    if let Some(n) = header_number(fields, "NPOINTS") {
        if n != y.len() as f64 {
            warnings.push(
                caution("reader.text.npoints_mismatch")
                    .with("expected", n)
                    .with("found", y.len()),
            );
        }
    }
    let n = y.len();
    let order = if last < first {
        Order::Descending
    } else {
        Order::Ascending
    };
    let xu = x_unit(names.first().map(String::as_str), &[first, last], warnings);
    let mut w = Vec::new();
    let yu = y_unit(names.first().map(String::as_str), &y, &mut w);
    warnings.extend(w.clone());
    Ok(vec![spectrum(
        XAxis {
            unit: xu,
            order,
            values: XValues::Regular { first, last, n },
        },
        YAxis {
            unit: yu,
            values: y,
            quantum: None,
        },
        w,
    )])
}

fn spectrum(x: XAxis, y: YAxis, warnings: Vec<Warning>) -> Spectrum {
    Spectrum {
        role: Role::Unknown,
        x,
        y,
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: Vec::new(),
        fields: Vec::new(),
        warnings,
    }
}

fn tokens(name: &str) -> Vec<String> {
    name.to_lowercase()
        .split(|c: char| !(c.is_alphanumeric() || c == '%'))
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

fn x_unit(name: Option<&str>, x: &[f64], warnings: &mut Vec<Warning>) -> XUnit {
    let n = name.unwrap_or("").to_lowercase();
    let toks = tokens(&n);
    let has = |t: &str| toks.iter().any(|k| k == t);
    if n.contains("cm-1")
        || n.contains("cm\u{207b}\u{b9}")
        || n.contains("1/cm")
        || n.contains("cm^-1")
        || has("wavenumber")
        || has("wavenumbers")
    {
        XUnit::Cm1
    } else if has("um") || has("\u{b5}m") || has("micron") || has("micrometers") {
        XUnit::Um
    } else if has("nm") || has("nanometers") {
        XUnit::Nm
    } else {
        let lo = x.iter().copied().fold(f64::INFINITY, f64::min);
        let hi = x.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        warnings.push(caution(if lo >= 300.0 && hi <= 8000.0 {
            "reader.text.xunit_hint_cm1"
        } else {
            "reader.text.xunit_unknown"
        }));
        XUnit::Points
    }
}

fn y_unit(name: Option<&str>, y: &[f64], warnings: &mut Vec<Warning>) -> YUnit {
    let toks = tokens(name.unwrap_or(""));
    let has = |t: &str| toks.iter().any(|k| k == t);
    let (lo, hi) = (
        y.iter().copied().fold(f64::INFINITY, f64::min),
        y.iter().copied().fold(f64::NEG_INFINITY, f64::max),
    );
    if has("abs") || has("absorbance") || has("a") {
        YUnit::Absorbance
    } else if has("%t") || has("t%") || has("%transmittance") {
        YUnit::TransmittancePercent
    } else if has("transmittance") || has("t") {
        if hi <= 1.5 {
            YUnit::TransmittanceFraction
        } else if hi <= 150.0 {
            YUnit::TransmittancePercent
        } else {
            YUnit::Unknown
        }
    } else if has("r") || has("reflectance") {
        YUnit::Reflectance
    } else {
        let mut sorted: Vec<f64> = y.to_vec();
        sorted.sort_by(f64::total_cmp);
        let median = sorted.get(sorted.len() / 2).copied().unwrap_or(0.0);
        let key = if lo >= -1.0 && hi <= 150.0 && median >= 50.0 {
            "reader.text.yunit_hint_percent_t"
        } else if lo >= -0.5 && hi <= 5.0 {
            "reader.text.yunit_hint_absorbance"
        } else {
            "reader.text.yunit_unknown"
        };
        warnings.push(caution(key));
        YUnit::Unknown
    }
}
