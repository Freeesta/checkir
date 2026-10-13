//! `quality_thresholds/1`: every limit of the measurement-quality checks as versioned data
//! (`data/soglie/quality_thresholds-1.json`), never as a constant in the code. A result stores the version used.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

pub const DEFAULT_JSON: &str = include_str!("../../../../data/soglie/quality_thresholds-1.json");
pub const SCHEMA: &str = "quality_thresholds/1";

#[derive(Debug, Clone, PartialEq)]
pub struct Co2 {
    pub band_cm1: (f64, f64),
    /// Two windows on both sides of the band; the local line goes through their medians.
    pub flanks_cm1: [(f64, f64); 2],
    pub max_deviation_abs: f64,
    pub min_points: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Vapour {
    pub band_cm1: (f64, f64),
    pub roughness_ratio: f64,
    /// Median roughness (absorbance per cm⁻¹) of a clean reference set; the limit is `roughness_ratio` times this.
    pub reference_median_roughness: f64,
    pub min_points: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Negative {
    pub excluded_cm1: Vec<(f64, f64)>,
    pub min_abs: f64,
    pub strong_min_abs: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Thresholds {
    pub version: u32,
    pub status: String,
    pub co2: Co2,
    pub vapour: Vapour,
    pub negative: Negative,
}

fn bad(field: &str) -> EngineError {
    EngineError::new("quality.thresholds_invalid", "invalid thresholds file")
        .with_param("field", field)
}

fn at<'a>(v: &'a Value, path: &[&str]) -> EngineResult<&'a Value> {
    let mut cur = v;
    for key in path {
        cur = cur.get(key).ok_or_else(|| bad(&path.join("/")))?;
    }
    Ok(cur)
}

fn num(v: &Value, path: &[&str]) -> EngineResult<f64> {
    at(v, path)?
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| bad(&path.join("/")))
}

fn positive(v: &Value, path: &[&str]) -> EngineResult<f64> {
    Some(num(v, path)?)
        .filter(|n| *n > 0.0)
        .ok_or_else(|| bad(&path.join("/")))
}

fn count(v: &Value, path: &[&str]) -> EngineResult<usize> {
    let n = num(v, path)?;
    if n.fract() != 0.0 || !(3.0..=1e6).contains(&n) {
        return Err(bad(&path.join("/")));
    }
    Ok(n as usize)
}

fn pair_of(v: &Value, field: &str) -> EngineResult<(f64, f64)> {
    match v.as_arr() {
        Some([a, b]) => match (a.as_f64(), b.as_f64()) {
            (Some(a), Some(b)) if a.is_finite() && a < b => Ok((a, b)),
            _ => Err(bad(field)),
        },
        _ => Err(bad(field)),
    }
}

fn pairs(v: &Value, path: &[&str]) -> EngineResult<Vec<(f64, f64)>> {
    let list = at(v, path)?.as_arr().ok_or_else(|| bad(&path.join("/")))?;
    list.iter().map(|p| pair_of(p, &path.join("/"))).collect()
}

fn co2(v: &Value) -> EngineResult<Co2> {
    let flanks = pairs(v, &["co2", "flanks_cm1"])?;
    let flanks: [(f64, f64); 2] = flanks.try_into().map_err(|_| bad("co2/flanks_cm1"))?;
    Ok(Co2 {
        band_cm1: pair_of(at(v, &["co2", "band_cm1"])?, "co2/band_cm1")?,
        flanks_cm1: flanks,
        max_deviation_abs: positive(v, &["co2", "max_deviation_abs"])?,
        min_points: count(v, &["co2", "min_points"])?,
    })
}

fn vapour(v: &Value) -> EngineResult<Vapour> {
    Ok(Vapour {
        band_cm1: pair_of(at(v, &["vapour", "band_cm1"])?, "vapour/band_cm1")?,
        roughness_ratio: positive(v, &["vapour", "roughness_ratio"])?,
        reference_median_roughness: positive(v, &["vapour", "reference_median_roughness"])?,
        min_points: count(v, &["vapour", "min_points"])?,
    })
}

fn negative(v: &Value) -> EngineResult<Negative> {
    let (min_abs, strong) = (
        num(v, &["negative", "min_abs"])?,
        num(v, &["negative", "strong_min_abs"])?,
    );
    if min_abs >= 0.0 || strong >= min_abs {
        return Err(bad("negative/strong_min_abs"));
    }
    Ok(Negative {
        excluded_cm1: pairs(v, &["negative", "excluded_cm1"])?,
        min_abs,
        strong_min_abs: strong,
    })
}

impl Thresholds {
    pub fn parse(text: &str) -> EngineResult<Self> {
        let v = json::parse(text)?;
        if at(&v, &["schema"])?.as_str() != Some(SCHEMA) {
            return Err(bad("schema"));
        }
        let version = num(&v, &["version"])?;
        if version.fract() != 0.0 || version < 1.0 {
            return Err(bad("version"));
        }
        let status = at(&v, &["calibration", "status"])?
            .as_str()
            .ok_or_else(|| bad("calibration/status"))?;
        Ok(Self {
            version: version as u32,
            status: status.to_string(),
            co2: co2(&v)?,
            vapour: vapour(&v)?,
            negative: negative(&v)?,
        })
    }

    pub fn embedded() -> EngineResult<Self> {
        Self::parse(DEFAULT_JSON)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn embedded_file_is_valid_and_draft() {
        let t = Thresholds::embedded().unwrap();
        assert_eq!(t.status, "draft");
        assert_eq!(t.co2.band_cm1, (2300.0, 2380.0));
    }

    #[test]
    fn broken_files_are_errors_with_a_key() {
        let e =
            Thresholds::parse(&DEFAULT_JSON.replace("quality_thresholds/1", "x/1")).unwrap_err();
        assert_eq!(e.error_key, "quality.thresholds_invalid");
        let w = DEFAULT_JSON.replace("-0.05", "0.05");
        assert!(Thresholds::parse(&w).is_err());
    }
}
