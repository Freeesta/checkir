//! `peaks_thresholds/1`: every limit of the peak detection as versioned data (`data/soglie/peaks_thresholds-1.json`),
//! never as a constant in the code. A result stores the version used.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

pub const DEFAULT_JSON: &str = include_str!("../../../../data/soglie/peaks_thresholds-1.json");
pub const SCHEMA: &str = "peaks_thresholds/1";

#[derive(Debug, Clone, PartialEq)]
pub struct Noise {
    pub windows_cm1: Vec<(f64, f64)>,
    pub window_width_cm1: f64,
    pub min_points: usize,
    pub smooth_window: usize,
    pub smooth_polyorder: usize,
    pub mad_scale: f64,
    pub grid_correction: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Detect {
    pub prominence_noise_ratio: f64,
    pub prominence_rel_min: f64,
    pub local_window_cm1: f64,
    pub local_noise_ratio: f64,
    pub min_distance_cm1: f64,
    pub rel_height: f64,
    pub exclude_cm1: Vec<(f64, f64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tiers {
    pub main_rel_min: f64,
    pub secondary_rel_min: f64,
    pub unexplained_rel_min: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Shoulders {
    pub derivative_window: usize,
    pub derivative_polyorder: usize,
    pub depth_noise_ratio: f64,
    pub min_distance_cm1: f64,
    pub min_lobe_width_cm1: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BroadBands {
    pub smooth_window: usize,
    pub smooth_polyorder: usize,
    pub prominence_rel_min: f64,
    pub min_fwhm_cm1: f64,
    pub min_sustained_fraction: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Artifacts {
    pub co2_search_cm1: (f64, f64),
    pub vapour_max_fwhm_cm1: f64,
    pub vapour_ranges_cm1: Vec<(f64, f64)>,
}

/// Read by the assignment (same-peak distance by shape, shift of strong ATR bands, classes of intensity).
#[derive(Debug, Clone, PartialEq)]
pub struct Tolerances {
    pub same_peak_cm1: [f64; 3],
    pub atr_strong_rel_min: f64,
    pub atr_down_cm1: f64,
    pub atr_up_cm1: f64,
    pub strong_rel_min: f64,
    pub medium_rel_min: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Thresholds {
    pub version: u32,
    pub noise: Noise,
    pub detect: Detect,
    pub tiers: Tiers,
    /// Upper limits (cm⁻¹) of the shapes narrow, medium, broad.
    pub shape_below_cm1: [f64; 3],
    pub centroid_from_fwhm_cm1: f64,
    pub shoulders: Shoulders,
    pub broad: BroadBands,
    pub artifacts: Artifacts,
    pub too_many_peaks: usize,
    pub tolerances: Tolerances,
}

fn bad(field: &str) -> EngineError {
    EngineError::new("peaks.soglie_non_valide", "invalid thresholds file")
        .with_param("campo", field)
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

fn count(v: &Value, path: &[&str]) -> EngineResult<usize> {
    let n = num(v, path)?;
    if n.fract() != 0.0 || !(0.0..=1e6).contains(&n) {
        return Err(bad(&path.join("/")));
    }
    Ok(n as usize)
}

fn pair_of(v: &Value, field: &str) -> EngineResult<(f64, f64)> {
    match v.as_arr() {
        Some([a, b]) => match (a.as_f64(), b.as_f64()) {
            (Some(a), Some(b)) if a < b => Ok((a, b)),
            _ => Err(bad(field)),
        },
        _ => Err(bad(field)),
    }
}

fn ranges(v: &Value, path: &[&str]) -> EngineResult<Vec<(f64, f64)>> {
    let list = at(v, path)?.as_arr().ok_or_else(|| bad(&path.join("/")))?;
    list.iter().map(|p| pair_of(p, &path.join("/"))).collect()
}

fn positive(v: &Value, path: &[&str]) -> EngineResult<f64> {
    let n = num(v, path)?;
    if n > 0.0 {
        Ok(n)
    } else {
        Err(bad(&path.join("/")))
    }
}

fn odd_window(v: &Value, path: &[&str]) -> EngineResult<usize> {
    let w = count(v, path)?;
    if w < 3 || w % 2 == 0 {
        return Err(bad(&path.join("/")));
    }
    Ok(w)
}

fn noise(v: &Value) -> EngineResult<Noise> {
    let p = |k: &'static str| ["noise", k];
    Ok(Noise {
        windows_cm1: ranges(v, &p("windows_cm1"))?,
        window_width_cm1: positive(v, &p("window_width_cm1"))?,
        min_points: count(v, &p("min_points"))?.max(3),
        smooth_window: odd_window(v, &p("smooth_window"))?,
        smooth_polyorder: count(v, &p("smooth_polyorder"))?,
        mad_scale: positive(v, &p("mad_scale"))?,
        grid_correction: positive(v, &p("grid_correction"))?,
    })
}

fn detect(v: &Value) -> EngineResult<Detect> {
    let p = |k: &'static str| ["detect", k];
    Ok(Detect {
        prominence_noise_ratio: num(v, &p("prominence_noise_ratio"))?,
        prominence_rel_min: num(v, &p("prominence_rel_min"))?,
        local_window_cm1: positive(v, &p("local_window_cm1"))?,
        local_noise_ratio: num(v, &p("local_noise_ratio"))?,
        min_distance_cm1: num(v, &p("min_distance_cm1"))?,
        rel_height: positive(v, &p("rel_height"))?,
        exclude_cm1: ranges(v, &p("exclude_cm1"))?,
    })
}

fn tolerances(v: &Value) -> EngineResult<Tolerances> {
    let same = |k: &'static str| num(v, &["tolerances", "same_peak_cm1", k]);
    let atr = |k: &'static str| num(v, &["tolerances", "atr_shift_cm1", k]);
    let class = |k: &'static str| num(v, &["tolerances", "intensity_classes", k]);
    Ok(Tolerances {
        same_peak_cm1: [same("narrow")?, same("medium")?, same("broad")?],
        atr_strong_rel_min: atr("strong_rel_min")?,
        atr_down_cm1: atr("down")?,
        atr_up_cm1: atr("up")?,
        strong_rel_min: class("strong_rel_min")?,
        medium_rel_min: class("medium_rel_min")?,
    })
}

impl Thresholds {
    /// The thresholds embedded in the build.
    pub fn embedded() -> EngineResult<Self> {
        Self::parse(DEFAULT_JSON)
    }

    pub fn parse(text_json: &str) -> EngineResult<Self> {
        let v = json::parse(text_json)?;
        if v.get("schema").and_then(Value::as_str) != Some(SCHEMA) {
            return Err(bad("schema"));
        }
        let shape = |k: &'static str| num(&v, &["shape", k]);
        let sh = |k: &'static str| ["shoulders", k];
        let br = |k: &'static str| ["broad_bands", k];
        let ar = |k: &'static str| ["artifacts", k];
        let co2 = at(&v, &ar("co2_search_cm1"))?;
        Ok(Self {
            version: count(&v, &["version"])? as u32,
            noise: noise(&v)?,
            detect: detect(&v)?,
            tiers: Tiers {
                main_rel_min: num(&v, &["tiers", "main_rel_min"])?,
                secondary_rel_min: num(&v, &["tiers", "secondary_rel_min"])?,
                unexplained_rel_min: num(&v, &["tiers", "unexplained_rel_min"])?,
            },
            shape_below_cm1: [
                shape("narrow_below_cm1")?,
                shape("medium_below_cm1")?,
                shape("broad_below_cm1")?,
            ],
            centroid_from_fwhm_cm1: num(&v, &["position", "centroid_from_fwhm_cm1"])?,
            shoulders: Shoulders {
                derivative_window: odd_window(&v, &sh("derivative_window"))?,
                derivative_polyorder: count(&v, &sh("derivative_polyorder"))?,
                depth_noise_ratio: num(&v, &sh("depth_noise_ratio"))?,
                min_distance_cm1: num(&v, &sh("min_distance_cm1"))?,
                min_lobe_width_cm1: num(&v, &sh("min_lobe_width_cm1"))?,
            },
            broad: BroadBands {
                smooth_window: odd_window(&v, &br("smooth_window"))?,
                smooth_polyorder: count(&v, &br("smooth_polyorder"))?,
                prominence_rel_min: num(&v, &br("prominence_rel_min"))?,
                min_fwhm_cm1: num(&v, &br("min_fwhm_cm1"))?,
                min_sustained_fraction: num(&v, &br("min_sustained_fraction"))?,
            },
            artifacts: Artifacts {
                co2_search_cm1: pair_of(co2, "artifacts/co2_search_cm1")?,
                vapour_max_fwhm_cm1: num(&v, &ar("vapour_max_fwhm_cm1"))?,
                vapour_ranges_cm1: ranges(&v, &ar("vapour_ranges_cm1"))?,
            },
            too_many_peaks: count(&v, &["warnings", "too_many_peaks"])?,
            tolerances: tolerances(&v)?,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn embedded_file_is_valid_and_has_the_agreed_values() {
        let t = Thresholds::embedded().expect("embedded thresholds");
        assert_eq!(t.version, 1);
        assert_eq!(t.noise.windows_cm1.len(), 3);
        assert_eq!(
            (t.detect.prominence_noise_ratio, t.detect.prominence_rel_min),
            (5.0, 0.02)
        );
        assert_eq!(t.shape_below_cm1, [15.0, 40.0, 150.0]);
        assert_eq!(t.tolerances.same_peak_cm1, [6.0, 6.0, 15.0]);
        assert_eq!(t.too_many_peaks, 80);
    }

    #[test]
    fn a_wrong_schema_or_a_missing_field_is_an_error() {
        let wrong = DEFAULT_JSON.replace("peaks_thresholds/1", "other/1");
        assert!(Thresholds::parse(&wrong).is_err());
        let missing = DEFAULT_JSON.replace("\"grid_correction\"", "\"grid_x\"");
        let e = Thresholds::parse(&missing).expect_err("missing field");
        assert_eq!(e.error_key, "peaks.soglie_non_valide");
    }
}
