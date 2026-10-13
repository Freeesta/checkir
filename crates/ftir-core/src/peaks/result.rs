//! The result of the peak detection, `peaks/1` (schema in `docs/schemi/peaks-1.json`): what was measured and how, with
//! the width of every peak and the numbers behind every warning. Positions have one decimal inside; the page shows them
//! as whole numbers with «~», because the real limit is the systematic error (ATR, shape, calibration).
use crate::passi::json::Value;

pub const SCHEMA: &str = "peaks/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    Narrow,
    Medium,
    Broad,
    VeryBroad,
}

impl Shape {
    pub fn id(self) -> &'static str {
        match self {
            Shape::Narrow => "narrow",
            Shape::Medium => "medium",
            Shape::Broad => "broad",
            Shape::VeryBroad => "very_broad",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Main,
    Secondary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Peak,
    Shoulder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Artifact {
    Co2,
    Vapour,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Peak {
    pub id: String,
    pub position_cm1: f64,
    pub height_abs: f64,
    pub prominence_abs: f64,
    pub prominence_rel: f64,
    /// `None` for a shoulder (it has no valley to measure a width from).
    pub fwhm_cm1: Option<f64>,
    pub shape: Option<Shape>,
    pub tier: Tier,
    pub kind: Kind,
    pub artifact: Option<Artifact>,
    pub region_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BroadBand {
    pub id: String,
    pub from_cm1: f64,
    pub to_cm1: f64,
    pub max_cm1: f64,
    pub prominence_rel: f64,
    pub region_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Warning {
    pub id: &'static str,
    pub data: Vec<(String, Value)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PeakList {
    pub spectrum_id: Option<String>,
    pub chain_id: &'static str,
    pub chain_steps: Vec<String>,
    pub thresholds_version: u32,
    pub noise_abs: f64,
    pub reference_abs: f64,
    pub peaks: Vec<Peak>,
    pub broad_bands: Vec<BroadBand>,
    pub warnings: Vec<Warning>,
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

impl Peak {
    fn to_value(&self) -> Value {
        let tier = match self.tier {
            Tier::Main => "main",
            Tier::Secondary => "secondary",
        };
        let kind = match self.kind {
            Kind::Peak => "peak",
            Kind::Shoulder => "shoulder",
        };
        let artifact = self.artifact.map(|a| match a {
            Artifact::Co2 => "co2",
            Artifact::Vapour => "vapour",
        });
        Value::Obj(vec![
            ("id".into(), text(&self.id)),
            ("position_cm1".into(), num(self.position_cm1)),
            ("height_abs".into(), num(self.height_abs)),
            ("prominence_abs".into(), num(self.prominence_abs)),
            ("prominence_rel".into(), num(self.prominence_rel)),
            ("fwhm_cm1".into(), self.fwhm_cm1.map_or(Value::Null, num)),
            ("shape".into(), opt(self.shape.map(Shape::id))),
            ("tier".into(), text(tier)),
            ("kind".into(), text(kind)),
            ("artifact".into(), opt(artifact)),
            ("region_ids".into(), ids(&self.region_ids)),
        ])
    }
}

fn num(x: f64) -> Value {
    Value::Num(x)
}

impl BroadBand {
    fn to_value(&self) -> Value {
        Value::Obj(vec![
            ("id".into(), text(&self.id)),
            ("from_cm1".into(), num(self.from_cm1)),
            ("to_cm1".into(), num(self.to_cm1)),
            ("max_cm1".into(), num(self.max_cm1)),
            ("prominence_rel".into(), num(self.prominence_rel)),
            ("region_ids".into(), ids(&self.region_ids)),
        ])
    }
}

fn ids(v: &[String]) -> Value {
    Value::Arr(v.iter().map(|s| text(s)).collect())
}

impl PeakList {
    /// The result as the JSON value of `peaks/1`.
    pub fn to_value(&self) -> Value {
        let chain = Value::Obj(vec![
            ("id".into(), text(self.chain_id)),
            (
                "steps".into(),
                Value::Arr(self.chain_steps.iter().map(|s| text(s)).collect()),
            ),
        ]);
        let warnings = self.warnings.iter().map(|w| {
            Value::Obj(vec![
                ("id".into(), text(w.id)),
                ("data".into(), Value::Obj(w.data.clone())),
            ])
        });
        Value::Obj(vec![
            ("schema".into(), text(SCHEMA)),
            ("spectrum_id".into(), opt(self.spectrum_id.as_deref())),
            ("chain".into(), chain),
            (
                "thresholds_version".into(),
                num(f64::from(self.thresholds_version)),
            ),
            ("noise_abs".into(), num(self.noise_abs)),
            ("reference_abs".into(), num(self.reference_abs)),
            (
                "peaks".into(),
                Value::Arr(self.peaks.iter().map(Peak::to_value).collect()),
            ),
            (
                "broad_bands".into(),
                Value::Arr(self.broad_bands.iter().map(BroadBand::to_value).collect()),
            ),
            ("warnings".into(), Value::Arr(warnings.collect())),
        ])
    }

    pub fn to_json(&self) -> String {
        self.to_value().write()
    }
}

fn opt(v: Option<&str>) -> Value {
    v.map_or(Value::Null, text)
}
