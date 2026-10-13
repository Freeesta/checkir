//! JSON in: the options of a comparison and the query spectrum (the page sends both as text).
use super::soglie::Thresholds;
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};
use crate::spectrum::{Role, Spectrum, YUnit};

const MAX_RANGES: usize = 16;
const KNOWN: [&str; 6] = [
    "ranges",
    "range_preset",
    "libraries",
    "origin",
    "expected_form",
    "sample_id",
];

/// Options of `confronta`. Without `ranges` or `range_preset` the comparison uses the whole grid (preset `full`).
#[derive(Debug, Clone, PartialEq)]
pub struct Options {
    /// Ranges in cm⁻¹; empty = the whole grid.
    pub ranges: Vec<(f64, f64)>,
    /// Id of the preset used, `None` for hand-chosen ranges.
    pub range_preset: Option<String>,
    /// The ranges were chosen by hand: thresholds not calibrated, level capped at "to check".
    pub custom: bool,
    /// The preset (or the whole grid) is calibrated for the level "probable".
    pub calibrated: bool,
    pub probable_r1: Option<f64>,
    pub probable_margin: Option<f64>,
    /// Ids of the libraries to search; `None` = all loaded.
    pub libraries: Option<Vec<String>>,
    /// Id of the spectrum a residual comes from (recorded in the result).
    pub origin: Option<String>,
    /// Form the chemist (or the peak analysis) expects, e.g. `hydrochloride`: `form_absent` fires when the library
    /// has not got it for the substance of the first candidate.
    pub expected_form: Option<String>,
    /// Id of the sample in the session: lets `same_as_previous` compare with the sample before it.
    pub sample_id: Option<String>,
}

fn invalid(field: &'static str, why: &str) -> EngineError {
    EngineError::new("confronti.opzione_non_valida", why).with_param("opzione", field)
}

fn range_list(v: &Value) -> EngineResult<Vec<(f64, f64)>> {
    let list = v
        .as_arr()
        .ok_or_else(|| invalid("ranges", "expected a list of [from, to]"))?;
    if list.is_empty() || list.len() > MAX_RANGES {
        return Err(invalid("ranges", "expected between 1 and 16 ranges"));
    }
    list.iter()
        .map(|r| match r.as_arr() {
            Some([a, b]) => match (a.as_f64(), b.as_f64()) {
                (Some(a), Some(b)) if a.is_finite() && b.is_finite() && a < b => Ok((a, b)),
                _ => Err(invalid("ranges", "each range needs from < to in cm-1")),
            },
            _ => Err(invalid("ranges", "each range is [from, to]")),
        })
        .collect()
}

fn text_list(v: &Value, field: &'static str) -> EngineResult<Vec<String>> {
    v.as_arr()
        .ok_or_else(|| invalid(field, "expected a list of ids"))?
        .iter()
        .map(|s| {
            s.as_str()
                .map(str::to_string)
                .ok_or_else(|| invalid(field, "expected text"))
        })
        .collect()
}

/// Parse the options text (`""` = defaults). Unknown keys, a preset that does not exist, or `ranges` together with
/// `range_preset` are errors.
pub fn parse_options(text: &str, t: &Thresholds) -> EngineResult<Options> {
    let v = if text.trim().is_empty() {
        Value::Obj(Vec::new())
    } else {
        json::parse(text)?
    };
    let Value::Obj(items) = &v else {
        return Err(invalid("options", "the options must be a JSON object"));
    };
    if let Some((k, _)) = items.iter().find(|(k, _)| !KNOWN.contains(&k.as_str())) {
        return Err(
            EngineError::new("confronti.opzione_sconosciuta", "unknown option")
                .with_param("opzione", k),
        );
    }
    let preset_id = v
        .get("range_preset")
        .map(|p| {
            p.as_str()
                .ok_or_else(|| invalid("range_preset", "expected text"))
        })
        .transpose()?;
    let mut o = Options {
        ranges: Vec::new(),
        range_preset: None,
        custom: false,
        calibrated: true,
        probable_r1: None,
        probable_margin: None,
        libraries: v
            .get("libraries")
            .map(|l| text_list(l, "libraries"))
            .transpose()?,
        origin: v.get("origin").and_then(Value::as_str).map(str::to_string),
        expected_form: v
            .get("expected_form")
            .and_then(Value::as_str)
            .map(str::to_string),
        sample_id: v
            .get("sample_id")
            .and_then(Value::as_str)
            .map(str::to_string),
    };
    match (v.get("ranges"), preset_id) {
        (Some(_), Some(_)) => {
            return Err(invalid(
                "ranges",
                "ranges and range_preset exclude each other",
            ))
        }
        (Some(r), None) => {
            o.ranges = range_list(r)?;
            o.custom = true;
            o.calibrated = false;
        }
        (None, id) => {
            let id = id.unwrap_or("full");
            let p = t.preset(id).ok_or_else(|| {
                EngineError::new("confronti.preset_sconosciuto", "unknown range preset")
                    .with_param("preset", id)
            })?;
            o.ranges = p.ranges.clone();
            o.range_preset = Some(p.id.clone());
            o.calibrated = p.calibrated;
            (o.probable_r1, o.probable_margin) = (p.probable_r1, p.probable_margin);
        }
    }
    Ok(o)
}

fn role_of(s: &str) -> Option<Role> {
    Some(match s {
        "sample" => Role::Sample,
        "reference" => Role::Reference,
        "residual" => Role::Residual,
        "subtraction" => Role::Subtraction,
        "mean" => Role::Mean,
        _ => return None,
    })
}

fn bad_query(why: &str) -> EngineError {
    EngineError::new("confronti.spettro_non_valido", why)
}

/// The query spectrum from JSON `{"role","y_unit","wavenumber_cm1":[…],"y":[…]}` (`null` in `y` = absent point).
/// Role defaults to `sample`, unit to `absorbance`.
pub fn parse_query(text: &str) -> EngineResult<Spectrum> {
    let v = json::parse(text)?;
    let role = match v.get("role").and_then(Value::as_str) {
        None => Role::Sample,
        Some(r) => role_of(r).ok_or_else(|| bad_query("unknown role"))?,
    };
    let unit = match v.get("y_unit").and_then(Value::as_str) {
        None | Some("absorbance") => YUnit::Absorbance,
        Some("transmittance") => YUnit::Transmittance,
        Some(_) => return Err(bad_query("unknown y_unit")),
    };
    let axis = v
        .get("wavenumber_cm1")
        .and_then(Value::as_arr)
        .ok_or_else(|| bad_query("no wavenumber_cm1"))?;
    let y = v
        .get("y")
        .and_then(Value::as_arr)
        .ok_or_else(|| bad_query("no y"))?;
    if axis.len() != y.len() || axis.len() < 5 {
        return Err(bad_query(
            "wavenumber_cm1 and y need the same length, at least 5",
        ));
    }
    let x = axis
        .iter()
        .map(|n| {
            n.as_f64()
                .filter(|f| f.is_finite())
                .ok_or_else(|| bad_query("wavenumber_cm1 must be numbers"))
        })
        .collect::<EngineResult<Vec<f64>>>()?;
    let y = y.iter().map(|n| n.as_f64().unwrap_or(f64::NAN)).collect();
    Ok(Spectrum::new(role, unit, x, y))
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn defaults_presets_and_conflicts() {
        let t = Thresholds::embedded().unwrap();
        let o = parse_options("", &t).unwrap();
        assert_eq!(
            (o.range_preset.as_deref(), o.custom, o.calibrated),
            (Some("full"), false, true)
        );
        let c = parse_options(r#"{"ranges":[[1000,1800]]}"#, &t).unwrap();
        assert!(c.custom && !c.calibrated && c.range_preset.is_none());
        assert!(parse_options(r#"{"ranges":[[1,2]],"range_preset":"full"}"#, &t).is_err());
        assert_eq!(
            parse_options(r#"{"range_preset":"x"}"#, &t)
                .unwrap_err()
                .error_key,
            "confronti.preset_sconosciuto"
        );
        assert_eq!(
            parse_options(r#"{"zzz":1}"#, &t).unwrap_err().error_key,
            "confronti.opzione_sconosciuta"
        );
        assert!(parse_options(r#"{"ranges":[[5,1]]}"#, &t).is_err());
    }

    #[test]
    fn query_defaults_and_nulls() {
        let q =
            parse_query(r#"{"role":"residual","wavenumber_cm1":[1,2,3,4,5],"y":[0,null,1,2,3]}"#)
                .unwrap();
        assert_eq!(q.role, Role::Residual);
        assert!(q.y[1].is_nan());
        assert!(parse_query(r#"{"wavenumber_cm1":[1],"y":[1]}"#).is_err());
    }
}
