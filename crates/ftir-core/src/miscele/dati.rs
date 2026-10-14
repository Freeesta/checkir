//! `soglie_miscele/1` and `tagli/2`: every limit of the mixture search and the list of common cuts as versioned data
//! (`data/soglie/soglie_miscele-1.json`, `data/tagli.json`), never as constants in the code.
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

pub const THRESHOLDS_JSON: &str = include_str!("../../../../data/soglie/soglie_miscele-1.json");
pub const CUTS_JSON: &str = include_str!("../../../../data/tagli.json");
const THRESHOLDS_SCHEMA: &str = "soglie_miscele/1";
const CUTS_SCHEMA: &str = "tagli/2";

#[derive(Debug, Clone, PartialEq)]
pub struct Thresholds {
    pub version: u32,
    pub background_order: usize,
    pub min_reference_coverage: f64,
    pub candidates_top: usize,
    pub max_components: usize,
    pub stop_variance_share: f64,
    pub second_active_variance_share: f64,
    pub derivative_pearson_min: f64,
    pub smooth_window: usize,
    pub smooth_polyorder: usize,
    pub high_residual_variance_share: f64,
    pub proposal_min_components: usize,
    pub proposal_max_unexplained_share: f64,
    pub proposal_min_explained_peaks: usize,
    pub minor_variance_share: f64,
    pub enforce_bands: bool,
    pub bands_tolerance_cm1: f64,
    pub bands_explained_fraction: f64,
    pub max_rounds: usize,
    pub round_stop_variance_share: f64,
    pub over_subtraction_noise_ratio: f64,
    pub reference_zone_fraction: f64,
}

fn bad(field: &str) -> EngineError {
    EngineError::new("miscele.dati_non_validi", "invalid mixture data").with_param("campo", field)
}

fn at<'a>(v: &'a Value, path: &[&str]) -> EngineResult<&'a Value> {
    path.iter()
        .try_fold(v, |v, k| v.get(k))
        .ok_or_else(|| bad(&path.join("/")))
}

fn num(v: &Value, path: &[&str]) -> EngineResult<f64> {
    at(v, path)?
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| bad(&path.join("/")))
}

fn count(v: &Value, path: &[&str]) -> EngineResult<usize> {
    let n = num(v, path)?;
    if n >= 1.0 && n.fract() == 0.0 && n < 1e6 {
        Ok(n as usize)
    } else {
        Err(bad(&path.join("/")))
    }
}

fn share(v: &Value, path: &[&str]) -> EngineResult<f64> {
    let n = num(v, path)?;
    if n > 0.0 && n <= 1.0 {
        Ok(n)
    } else {
        Err(bad(&path.join("/")))
    }
}

fn flag(v: &Value, path: &[&str]) -> EngineResult<bool> {
    match at(v, path)? {
        Value::Bool(b) => Ok(*b),
        _ => Err(bad(&path.join("/"))),
    }
}

impl Thresholds {
    /// The thresholds embedded in the build.
    pub fn embedded() -> EngineResult<Self> {
        Self::parse(THRESHOLDS_JSON)
    }

    pub fn parse(text: &str) -> EngineResult<Self> {
        let v = json::parse(text)?;
        if v.get("schema").and_then(Value::as_str) != Some(THRESHOLDS_SCHEMA) {
            return Err(bad("schema"));
        }
        let background_order = num(&v, &["space", "background_order"])?;
        if !(0.0..=6.0).contains(&background_order) || background_order.fract() != 0.0 {
            return Err(bad("space/background_order"));
        }
        let pearson = num(&v, &["analogues", "derivative_pearson_min"])?;
        if !(-1.0..=1.0).contains(&pearson) {
            return Err(bad("analogues/derivative_pearson_min"));
        }
        Ok(Self {
            version: count(&v, &["version"])? as u32,
            background_order: background_order as usize,
            min_reference_coverage: share(&v, &["space", "min_reference_coverage"])?,
            candidates_top: count(&v, &["selection", "candidates_top"])?,
            max_components: count(&v, &["selection", "max_components"])?,
            stop_variance_share: share(&v, &["selection", "stop_variance_share"])?,
            second_active_variance_share: share(
                &v,
                &["selection", "second_active_variance_share"],
            )?,
            derivative_pearson_min: pearson,
            smooth_window: count(&v, &["analogues", "smooth_window"])?,
            smooth_polyorder: count(&v, &["analogues", "smooth_polyorder"])?,
            high_residual_variance_share: share(&v, &["residual", "high_residual_variance_share"])?,
            proposal_min_components: count(&v, &["proposal", "min_components"])?,
            proposal_max_unexplained_share: share(
                &v,
                &["proposal", "max_unexplained_variance_share"],
            )?,
            proposal_min_explained_peaks: count(&v, &["proposal", "min_explained_peaks"])?,
            minor_variance_share: share(&v, &["proposal", "minor_variance_share"])?,
            enforce_bands: flag(&v, &["bands_criterion", "enforce"])?,
            bands_tolerance_cm1: num(&v, &["bands_criterion", "tolerance_cm1"])?,
            bands_explained_fraction: share(&v, &["bands_criterion", "explained_fraction"])?,
            max_rounds: count(&v, &["subtraction", "max_rounds"])?,
            round_stop_variance_share: share(&v, &["subtraction", "stop_variance_share"])?,
            over_subtraction_noise_ratio: num(
                &v,
                &["subtraction", "over_subtraction_noise_ratio"],
            )?,
            reference_zone_fraction: share(&v, &["subtraction", "reference_zone_fraction"])?,
        })
    }
}

/// The list of common cuts: a candidate is a cut when its substance id or its name matches an entry.
#[derive(Debug, Clone, PartialEq)]
pub struct Cuts {
    pub version: u32,
    names: Vec<String>,
}

fn normalise(s: &str) -> String {
    s.trim().to_lowercase()
}

impl Cuts {
    pub fn embedded() -> EngineResult<Self> {
        Self::parse(CUTS_JSON)
    }

    pub fn parse(text: &str) -> EngineResult<Self> {
        let v = json::parse(text)?;
        if v.get("schema").and_then(Value::as_str) != Some(CUTS_SCHEMA) {
            return Err(bad("schema"));
        }
        let list = at(&v, &["cuts"])?.as_arr().ok_or_else(|| bad("cuts"))?;
        let mut names = Vec::new();
        for entry in list {
            let id = at(entry, &["id"])?.as_str().ok_or_else(|| bad("cuts/id"))?;
            names.push(normalise(id));
            for n in at(entry, &["names"])?
                .as_arr()
                .ok_or_else(|| bad("cuts/names"))?
            {
                names.push(normalise(n.as_str().ok_or_else(|| bad("cuts/names"))?));
            }
        }
        Ok(Self {
            version: count(&v, &["version"])? as u32,
            names,
        })
    }

    /// True when `substance` (id) or `name` is on the list.
    pub fn contains(&self, substance: Option<&str>, name: &str) -> bool {
        let hit = |s: &str| self.names.iter().any(|n| *n == normalise(s));
        substance.is_some_and(hit) || hit(name)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn embedded_files_are_valid_and_carry_the_agreed_values() {
        let t = Thresholds::embedded().expect("thresholds");
        assert_eq!((t.version, t.max_components, t.background_order), (2, 3, 3));
        assert_eq!(
            (t.proposal_min_components, t.proposal_min_explained_peaks),
            (2, 1)
        );
        assert_eq!(t.proposal_max_unexplained_share, 0.3);
        assert_eq!(t.stop_variance_share, 0.02);
        assert_eq!(t.second_active_variance_share, 0.10);
        assert_eq!(t.high_residual_variance_share, 0.15);
        let c = Cuts::embedded().expect("cuts");
        assert!(c.contains(None, "Caffeine") && c.contains(Some("paracetamol"), "x"));
        assert!(!c.contains(Some("mdma"), "MDMA"));
    }

    #[test]
    fn a_wrong_schema_or_a_missing_field_is_an_error() {
        let wrong = THRESHOLDS_JSON.replace("soglie_miscele/1", "other/1");
        assert!(Thresholds::parse(&wrong).is_err());
        let missing = THRESHOLDS_JSON.replace("\"max_components\"", "\"max_x\"");
        let e = Thresholds::parse(&missing).expect_err("missing field");
        assert_eq!(e.error_key, "miscele.dati_non_validi");
        assert!(Cuts::parse(&CUTS_JSON.replace("tagli/2", "x/2")).is_err());
    }
}
