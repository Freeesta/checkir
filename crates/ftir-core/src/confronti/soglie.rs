//! `soglie-confronto/1`: the thresholds of the library comparison as versioned data (`data/soglie_confronto.json`),
//! never as constants in the code. The defaults are the file embedded at build time; a result stores the version used.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

pub const DEFAULT_JSON: &str = include_str!("../../../../data/soglie_confronto.json");
pub const SCHEMA: &str = "soglie-confronto/1";

/// One of the fixed explanation regions (cm⁻¹), e.g. `3700-2500`.
#[derive(Debug, Clone, PartialEq)]
pub struct Region {
    pub id: String,
    pub from_cm1: f64,
    pub to_cm1: f64,
}

/// A named range selection.
#[derive(Debug, Clone, PartialEq)]
pub struct Preset {
    pub id: String,
    pub ranges: Vec<(f64, f64)>,
    pub probable_r1: Option<f64>,
    pub probable_margin: Option<f64>,
}

/// Provisional limits of the measurement-quality alerts (`quality` in the data file), all in the units of the
/// absorbance spectrum on the comparison grid.
#[derive(Debug, Clone, PartialEq)]
pub struct Quality {
    pub saturation_a: f64,
    pub weak_signal_a: f64,
    pub snr_min: f64,
    pub noise_band: (f64, f64),
    pub co2_band: (f64, f64),
    pub co2_edge_cm1: f64,
    pub co2_noise_ratio: f64,
    pub vapour_band: (f64, f64),
    pub vapour_noise_ratio: f64,
    pub negative_noise_ratio: f64,
    pub negative_span_cm1: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Thresholds {
    pub version: u32,
    pub probable_r1: f64,
    pub probable_margin: f64,
    pub probable_coverage: f64,
    pub check_r1: f64,
    pub ambiguity_margin: f64,
    pub twin_r: f64,
    pub same_as_previous_r: f64,
    pub region_agreement: RegionAgreement,
    pub quality: Quality,
    pub min_cm1: f64,
    pub min_points: usize,
    pub regions: Vec<Region>,
    pub presets: Vec<Preset>,
}

fn bad(field: &str) -> EngineError {
    EngineError::new("confronti.soglie_non_valide", "invalid thresholds file")
        .with_param("campo", field)
}

fn num(v: &Value, path: &[&str]) -> EngineResult<f64> {
    let mut cur = v;
    for key in path {
        cur = cur.get(key).ok_or_else(|| bad(&path.join("/")))?;
    }
    cur.as_f64().ok_or_else(|| bad(&path.join("/")))
}

fn pair(v: &Value, field: &str) -> EngineResult<(f64, f64)> {
    match v.as_arr() {
        Some([a, b]) => match (a.as_f64(), b.as_f64()) {
            (Some(a), Some(b)) if a < b => Ok((a, b)),
            _ => Err(bad(field)),
        },
        _ => Err(bad(field)),
    }
}

fn list<'a>(v: &'a Value, key: &str) -> EngineResult<&'a [Value]> {
    v.get(key).and_then(Value::as_arr).ok_or_else(|| bad(key))
}

fn preset(v: &Value) -> EngineResult<Preset> {
    let ranges = list(v, "ranges")?
        .iter()
        .map(|r| pair(r, "range_presets/ranges"))
        .collect::<EngineResult<Vec<_>>>()?;
    Ok(Preset {
        id: text(v, "id")?,
        ranges,
        probable_r1: v.get("probable_r1").and_then(Value::as_f64),
        probable_margin: v.get("probable_margin").and_then(Value::as_f64),
    })
}

fn band(v: &Value, key: &str) -> EngineResult<(f64, f64)> {
    let (a, b) = (
        num(v, &["quality", &format!("{key}_from_cm1")])?,
        num(v, &["quality", &format!("{key}_to_cm1")])?,
    );
    if a < b {
        Ok((a, b))
    } else {
        Err(bad(&format!("quality/{key}")))
    }
}

fn quality(v: &Value) -> EngineResult<Quality> {
    let q = |k: &str| num(v, &["quality", k]);
    Ok(Quality {
        saturation_a: q("saturation_a")?,
        weak_signal_a: q("weak_signal_a")?,
        snr_min: q("snr_min")?,
        noise_band: band(v, "noise")?,
        co2_band: band(v, "co2")?,
        co2_edge_cm1: q("co2_edge_cm1")?,
        co2_noise_ratio: q("co2_noise_ratio")?,
        vapour_band: band(v, "vapour")?,
        vapour_noise_ratio: q("vapour_noise_ratio")?,
        negative_noise_ratio: q("negative_noise_ratio")?,
        negative_span_cm1: q("negative_span_cm1")?,
    })
}

fn agreement(v: &Value) -> EngineResult<RegionAgreement> {
    let a = |k: &str| num(v, &["region_agreement", k]);
    Ok(RegionAgreement {
        agree_min: a("agree_min")?,
        partial_min: a("partial_min")?,
        signal_share_min: a("signal_share_min")?,
    })
}

fn text(v: &Value, key: &str) -> EngineResult<String> {
    Ok(v.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| bad(key))?
        .to_string())
}

impl Thresholds {
    /// The thresholds embedded in the build (`data/soglie_confronto.json`).
    pub fn embedded() -> EngineResult<Self> {
        Self::parse(DEFAULT_JSON)
    }

    pub fn parse(text_json: &str) -> EngineResult<Self> {
        let v = json::parse(text_json)?;
        if v.get("schema").and_then(Value::as_str) != Some(SCHEMA) {
            return Err(bad("schema"));
        }
        let regions = list(&v, "regions")?
            .iter()
            .map(|r| {
                Ok(Region {
                    id: text(r, "id")?,
                    from_cm1: num(r, &["from_cm1"])?,
                    to_cm1: num(r, &["to_cm1"])?,
                })
            })
            .collect::<EngineResult<Vec<_>>>()?;
        let presets = list(&v, "range_presets")?
            .iter()
            .map(preset)
            .collect::<EngineResult<Vec<_>>>()?;
        Ok(Self {
            version: num(&v, &["version"])? as u32,
            probable_r1: num(&v, &["probable", "r1_min"])?,
            probable_margin: num(&v, &["probable", "margin_min"])?,
            probable_coverage: num(&v, &["probable", "coverage_min"])?,
            check_r1: num(&v, &["to_check", "r1_min"])?,
            ambiguity_margin: num(&v, &["ambiguity", "margin_below"])?,
            twin_r: num(&v, &["spectral_twin", "r_min"])?,
            same_as_previous_r: num(&v, &["same_as_previous", "r_min"])?,
            region_agreement: agreement(&v)?,
            quality: quality(&v)?,
            min_cm1: num(&v, &["range_limits", "min_cm1"])?,
            min_points: num(&v, &["range_limits", "min_points"])? as usize,
            regions,
            presets,
        })
    }

    pub fn preset(&self, id: &str) -> Option<&Preset> {
        self.presets.iter().find(|p| p.id == id)
    }
}

/// How the r of a region is read (`region_agreement`): the states `agrees`, `partial`, `disagrees`, and `low_signal`
/// for a region holding less than `signal_share_min` of the energy of the sample derivative.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RegionAgreement {
    pub agree_min: f64,
    pub partial_min: f64,
    pub signal_share_min: f64,
}

impl RegionAgreement {
    /// State of a region: `low_signal` when the sample holds too little of its energy there (the r is shown, not
    /// judged), `unknown` without an r, else `agrees` / `partial` / `disagrees`.
    pub fn state(&self, r: Option<f64>, signal_share: f64) -> &'static str {
        match r.filter(|r| r.is_finite()) {
            None => "unknown",
            Some(_) if signal_share < self.signal_share_min => "low_signal",
            Some(r) if r >= self.agree_min => "agrees",
            Some(r) if r >= self.partial_min => "partial",
            Some(_) => "disagrees",
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn embedded_file_is_valid_and_has_the_agreed_values() {
        let t = Thresholds::embedded().expect("embedded thresholds");
        assert_eq!((t.probable_r1, t.probable_margin), (0.95, 0.05));
        assert_eq!(
            (t.check_r1, t.twin_r, t.probable_coverage),
            (0.85, 0.9, 0.8)
        );
        assert_eq!(t.regions.len(), 4);
        assert_eq!(t.same_as_previous_r, 0.99);
        assert_eq!(
            t.region_agreement,
            RegionAgreement {
                agree_min: 0.9,
                partial_min: 0.7,
                signal_share_min: 0.01
            }
        );
        assert_eq!(t.quality.co2_band, (2330.0, 2370.0));
        assert!(t.preset("full").is_some());
    }

    #[test]
    fn a_wrong_file_is_an_error_naming_the_field() {
        let e = Thresholds::parse(r#"{"schema":"soglie-confronto/1"}"#).unwrap_err();
        assert_eq!(e.error_key, "confronti.soglie_non_valide");
        assert!(Thresholds::parse(r#"{"schema":"x"}"#).is_err());
    }
}
