//! JSON faces of the didactic functions, for the wasm bridge (which holds no logic). Non-finite numbers become `null`.

use super::apodization::Apodization;
use super::interferogram::{interferogram_from_lines, Interferogram, Line};
use super::spectrum::{spectrum_from_interferogram, Options, Output};
use super::{depth, ratio, spring};
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{parse, Value};

fn num(x: f64) -> Value {
    if x.is_finite() {
        Value::Num(x)
    } else {
        Value::Null
    }
}

fn array(v: &[f64]) -> Value {
    Value::Arr(v.iter().map(|x| num(*x)).collect())
}

fn obj(items: Vec<(&str, Value)>) -> String {
    Value::Obj(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect()).write()
}

fn invalid(what: &str) -> EngineError {
    EngineError::new("didactic.invalid_input", "invalid input").with_param("what", what)
}

/// `{reduced_mass_u, wavenumber_cm1}`.
pub fn spring_json(k_n_m: f64, mass_a_u: f64, mass_b_u: f64) -> EngineResult<String> {
    let s = spring::spring(k_n_m, mass_a_u, mass_b_u)?;
    Ok(obj(vec![
        ("reduced_mass_u", num(s.reduced_mass_u)),
        ("wavenumber_cm1", num(s.wavenumber_cm1)),
    ]))
}

/// `{wavelength_um, depth_um, critical_angle_deg}`.
pub fn penetration_depth_json(nu: f64, n1: f64, n2: f64, angle_deg: f64) -> EngineResult<String> {
    let d = depth::penetration_depth(nu, n1, n2, angle_deg)?;
    Ok(obj(vec![
        ("wavelength_um", num(d.wavelength_um)),
        ("depth_um", num(d.depth_um)),
        ("critical_angle_deg", num(d.critical_angle_deg)),
    ]))
}

/// `{transmittance[], absorbance[]}` (`null` = absent point).
pub fn ratio_json(sample: &[f64], background: &[f64]) -> EngineResult<String> {
    let r = ratio::ratio_to_absorbance(sample, background)?;
    Ok(obj(vec![
        ("transmittance", array(&r.transmittance)),
        ("absorbance", array(&r.absorbance)),
    ]))
}

fn ifg_value(i: &Interferogram) -> Vec<(&'static str, Value)> {
    let x: Vec<f64> = (0..i.intensity.len()).map(|j| i.opd_cm(j)).collect();
    vec![
        ("step_cm", num(i.step_cm)),
        ("zpd_index", num(i.zpd_index as f64)),
        ("opd_cm", array(&x)),
        ("intensity", array(&i.intensity)),
    ]
}

fn parse_lines(text: &str) -> EngineResult<Vec<Line>> {
    let v = parse(text)?;
    let items = v.as_arr().ok_or_else(|| invalid("lines"))?;
    items
        .iter()
        .map(|it| {
            let f = |k: &str| it.get(k).and_then(Value::as_f64);
            Ok(Line {
                wavenumber_cm1: f("wavenumber_cm1").ok_or_else(|| invalid("wavenumber_cm1"))?,
                amplitude: f("amplitude").ok_or_else(|| invalid("amplitude"))?,
                width_cm1: f("width_cm1").unwrap_or(0.0),
            })
        })
        .collect()
}

/// `lines_json` = `[{wavenumber_cm1, amplitude, width_cm1?}]` → `{step_cm, zpd_index, opd_cm[], intensity[]}`.
pub fn interferogram_from_lines_json(
    lines_json: &str,
    half_points: usize,
    step_cm: f64,
) -> EngineResult<String> {
    let lines = parse_lines(lines_json)?;
    let i = interferogram_from_lines(&lines, half_points, step_cm)?;
    Ok(obj(ifg_value(&i)))
}

fn parse_options(text: &str) -> EngineResult<Options> {
    let v = parse(text)?;
    let opd_max_cm = v
        .get("opd_max_cm")
        .and_then(Value::as_f64)
        .ok_or_else(|| invalid("opd_max_cm"))?;
    let apodization = Apodization::from_id(
        v.get("apodization")
            .and_then(Value::as_str)
            .unwrap_or("boxcar"),
    )?;
    let zero_fill = v.get("zero_fill").and_then(Value::as_f64).unwrap_or(1.0);
    let output = match v.get("output").and_then(Value::as_str) {
        None | Some("real") => Output::Real,
        Some("magnitude") => Output::Magnitude,
        Some(_) => return Err(invalid("output")),
    };
    Ok(Options {
        opd_max_cm,
        apodization,
        zero_fill: if (1.0..1e9).contains(&zero_fill) {
            zero_fill as usize
        } else {
            0
        },
        output,
    })
}

/// `options_json` = `{opd_max_cm, apodization?, zero_fill?, output?}` →
/// `{wavenumber_cm1[], intensity[], resolution_cm1, point_spacing_cm1}`.
pub fn spectrum_from_interferogram_json(
    intensity: &[f64],
    step_cm: f64,
    zpd_index: usize,
    options_json: &str,
) -> EngineResult<String> {
    let opts = parse_options(options_json)?;
    let ifg = Interferogram {
        step_cm,
        zpd_index,
        intensity: intensity.to_vec(),
    };
    let s = spectrum_from_interferogram(&ifg, &opts)?;
    Ok(obj(vec![
        ("wavenumber_cm1", array(&s.wavenumber_cm1)),
        ("intensity", array(&s.intensity)),
        ("resolution_cm1", num(s.resolution_cm1)),
        ("point_spacing_cm1", num(s.point_spacing_cm1)),
    ]))
}
