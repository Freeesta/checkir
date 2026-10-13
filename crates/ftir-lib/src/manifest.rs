//! `manifest.json` (`ftir-library/1`): identity, licence, attribution, common grid and the SHA-256 of `data.bin`.
use crate::{invalid, obj, string, text};
use ftir_core::error::EngineResult;
use ftir_core::passi::json::parse;
use ftir_core::passi::Value;

pub const SCHEMA: &str = "ftir-library/1";
const KEY: &str = "library.manifest_invalid";
/// A grid never has more points than this (the limits of `package` are far below).
const MAX_GRID_POINTS: f64 = 1e6;

#[derive(Debug, Clone, PartialEq)]
pub struct Grid {
    pub from_cm1: f64,
    pub to_cm1: f64,
    pub step_cm1: f64,
}

impl Grid {
    /// The grid of the match chain: 650–3800 cm⁻¹, step 2 (1576 points).
    pub const STANDARD: Grid = Grid {
        from_cm1: 650.0,
        to_cm1: 3800.0,
        step_cm1: 2.0,
    };

    /// Number of points, as `passi::griglia` counts them.
    pub fn points(&self) -> EngineResult<usize> {
        let ok = self.step_cm1.is_finite()
            && self.step_cm1 > 0.0
            && self.from_cm1.is_finite()
            && self.to_cm1 >= self.from_cm1;
        let n = ((self.to_cm1 - self.from_cm1) / self.step_cm1 + 1e-9).floor() + 1.0;
        if !ok || n > MAX_GRID_POINTS {
            return Err(invalid(KEY, "grid"));
        }
        Ok(n as usize)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Manifest {
    pub name: String,
    pub version: String,
    pub date: String,
    pub license: String,
    pub attribution_it: Option<String>,
    pub attribution_en: String,
    /// Conditions of a third-party permission (non-commercial use, disclaimer, no endorsement), shown with the library.
    pub terms_it: Option<String>,
    pub terms_en: Option<String>,
    pub grid: Grid,
    pub n_spectra: usize,
    pub sha256_data: String,
    pub private: bool,
}

fn req<'a>(v: &'a Value, name: &str) -> EngineResult<&'a str> {
    text(v, name).ok_or_else(|| invalid(KEY, name))
}

fn number(v: &Value, name: &str) -> EngineResult<f64> {
    v.get(name)
        .and_then(Value::as_f64)
        .ok_or_else(|| invalid(KEY, name))
}

fn parse_grid(v: &Value) -> EngineResult<Grid> {
    let g = v.get("grid").ok_or_else(|| invalid(KEY, "grid"))?;
    let grid = Grid {
        from_cm1: number(g, "from_cm1")?,
        to_cm1: number(g, "to_cm1")?,
        step_cm1: number(g, "step_cm1")?,
    };
    grid.points()?;
    Ok(grid)
}

/// `schema` must be `ftir-library/1`; another value is `library.schema_unknown`.
fn check_schema(v: &Value) -> EngineResult<()> {
    match text(v, "schema") {
        Some(SCHEMA) => {}
        Some(other) => {
            return Err(ftir_core::error::EngineError::new(
                "library.schema_unknown",
                "unknown library schema",
            )
            .with_param("schema", other))
        }
        None => return Err(invalid(KEY, "schema")),
    }
    Ok(())
}

/// The optional `terms` (`it`, `en`); when present, `en` is required.
fn parse_terms(v: &Value) -> EngineResult<(Option<String>, Option<String>)> {
    let Some(t) = v.get("terms") else {
        return Ok((None, None));
    };
    let en = text(t, "en").ok_or_else(|| invalid(KEY, "terms"))?;
    Ok((text(t, "it").map(str::to_string), Some(en.to_string())))
}

/// `{"it": …, "en": …}` with `it` only when present.
fn texts(it: Option<&str>, en: &str) -> Value {
    let mut v: Vec<(&str, Value)> = it.map(|it| ("it", string(it))).into_iter().collect();
    v.push(("en", string(en)));
    obj(v)
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

impl Manifest {
    /// Reads a manifest; a missing or malformed member is `library.manifest_invalid` with the member name.
    pub fn parse(source: &str) -> EngineResult<Manifest> {
        let v = parse(source).map_err(|_| invalid(KEY, "json"))?;
        check_schema(&v)?;
        let attribution = v
            .get("attribution")
            .ok_or_else(|| invalid(KEY, "attribution"))?;
        let (terms_it, terms_en) = parse_terms(&v)?;
        let n = number(&v, "n_spectra")?;
        if !(n >= 0.0 && n.fract() == 0.0 && n <= 1e9) {
            return Err(invalid(KEY, "n_spectra"));
        }
        let sha256_data = req(&v, "sha256_data")?.to_string();
        if !is_hex64(&sha256_data) {
            return Err(invalid(KEY, "sha256_data"));
        }
        Ok(Manifest {
            name: req(&v, "name")?.to_string(),
            version: req(&v, "version")?.to_string(),
            date: req(&v, "date")?.to_string(),
            license: req(&v, "license")?.to_string(),
            attribution_it: text(attribution, "it").map(str::to_string),
            attribution_en: req(attribution, "en")?.to_string(),
            terms_it,
            terms_en,
            grid: parse_grid(&v)?,
            n_spectra: n as usize,
            sha256_data,
            private: matches!(v.get("private"), Some(Value::Bool(true))),
        })
    }

    /// Compact JSON text in the key order of the schema.
    pub fn to_json(&self) -> String {
        let mut members = vec![
            ("schema", string(SCHEMA)),
            ("name", string(&self.name)),
            ("version", string(&self.version)),
            ("date", string(&self.date)),
            ("license", string(&self.license)),
            (
                "attribution",
                texts(self.attribution_it.as_deref(), &self.attribution_en),
            ),
        ];
        if let Some(en) = &self.terms_en {
            members.push(("terms", texts(self.terms_it.as_deref(), en)));
        }
        members.extend([
            (
                "grid",
                obj(vec![
                    ("from_cm1", Value::Num(self.grid.from_cm1)),
                    ("to_cm1", Value::Num(self.grid.to_cm1)),
                    ("step_cm1", Value::Num(self.grid.step_cm1)),
                ]),
            ),
            ("n_spectra", Value::Num(self.n_spectra as f64)),
            ("sha256_data", string(&self.sha256_data)),
        ]);
        if self.private {
            members.push(("private", Value::Bool(true)));
        }
        obj(members).write()
    }
}
