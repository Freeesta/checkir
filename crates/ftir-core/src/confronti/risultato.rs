//! The result of a comparison, `ftir-risultato-confronto/1` (schema in `docs/schemi/`). It records everything needed to
//! repeat or audit the calculation: chain, baseline, libraries (id, version, size), thresholds version, ranges, grouping.
use super::indice::{Grouping, Index};
use super::{asls, soglie, CACHE_VERSION};
use crate::passi::json::Value;
use crate::spectrum::Role;

pub const SCHEMA: &str = "ftir-risultato-confronto/1";

impl Outcome {
    /// The result as the JSON value of `ftir-risultato-confronto/1`.
    pub fn to_value(&self, index: &Index) -> Value {
        let libraries = index.libs.iter().enumerate().map(|(i, l)| {
            Value::Obj(vec![
                ("id".into(), text(&l.id)),
                ("version".into(), text(&l.version)),
                ("spectra".into(), Value::Num(l.len() as f64)),
                ("searched".into(), Value::Bool(self.searched.contains(&i))),
            ])
        });
        let candidates = self
            .candidates
            .iter()
            .enumerate()
            .map(|(i, c)| candidate_json(i + 1, c, index));
        let alerts = self.alerts.iter().map(|a| {
            Value::Obj(vec![
                ("id".into(), text(a.id)),
                ("data".into(), Value::Obj(a.data.clone())),
            ])
        });
        let margin_vs = self.margin_vs.map_or(Value::Null, |(g, r)| {
            let e = index.entry(g);
            Value::Obj(vec![
                ("display_name".into(), text(&e.display_name)),
                ("form".into(), text(&e.form)),
                ("r_derivative".into(), num(r)),
            ])
        });
        let grouping = match index.grouping {
            Grouping::Identity => "identity",
            Grouping::Name => "name",
            Grouping::Mixed => "mixed",
        };
        let query = Value::Obj(vec![
            ("role".into(), text(role_id(self.query_role))),
            (
                "origin".into(),
                self.origin.as_deref().map_or(Value::Null, text),
            ),
        ]);
        let thresholds = self.thresholds_json();
        let twins = Value::Obj(vec![
            ("done".into(), Value::Num(index.twins.done as f64)),
            ("total".into(), Value::Num(index.total() as f64)),
        ]);
        Value::Obj(vec![
            ("schema".into(), text(SCHEMA)),
            ("chain".into(), chain_json()),
            ("thresholds".into(), thresholds),
            ("query".into(), query),
            ("libraries".into(), Value::Arr(libraries.collect())),
            ("ranges".into(), ranges_json(&self.ranges)),
            (
                "range_preset".into(),
                self.range_preset.as_deref().map_or(Value::Null, text),
            ),
            ("grouping".into(), text(grouping)),
            ("candidates".into(), Value::Arr(candidates.collect())),
            ("margin".into(), self.margin.map_or(Value::Null, num)),
            ("margin_vs".into(), margin_vs),
            ("level_proposed".into(), text(self.level.id())),
            ("tier".into(), text(self.level.tier())),
            (
                "region_signal".into(),
                Value::Obj(
                    self.region_signal
                        .iter()
                        .map(|(k, s)| (k.clone(), num(*s)))
                        .collect(),
                ),
            ),
            (
                "level_caps".into(),
                Value::Arr(self.level_caps.iter().map(|c| text(c)).collect()),
            ),
            ("alerts".into(), Value::Arr(alerts.collect())),
            ("twins".into(), twins),
        ])
    }

    fn thresholds_json(&self) -> Value {
        let a = self.region_agreement;
        Value::Obj(vec![
            ("schema".into(), text(soglie::SCHEMA)),
            (
                "version".into(),
                Value::Num(f64::from(self.thresholds_version)),
            ),
            (
                "region_agreement".into(),
                Value::Obj(vec![
                    ("agree_min".into(), Value::Num(a.agree_min)),
                    ("partial_min".into(), Value::Num(a.partial_min)),
                    ("signal_share_min".into(), Value::Num(a.signal_share_min)),
                ]),
            ),
        ])
    }

    pub fn to_json(&self, index: &Index) -> String {
        self.to_value(index).write()
    }
}

/// Level proposed by the program. There is no "confirmed" level: only the chemist can confirm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Probable,
    ToCheck,
    NotIdentified,
}

impl Level {
    /// Identification tier of the level: T2 probable, T3 to check, T4 not identified. T1 (confirmed) is never
    /// proposed here: only the chemist assigns it.
    pub fn tier(self) -> &'static str {
        match self {
            Level::Probable => "T2",
            Level::ToCheck => "T3",
            Level::NotIdentified => "T4",
        }
    }
}

impl Level {
    pub fn id(self) -> &'static str {
        match self {
            Level::Probable => "probable",
            Level::ToCheck => "to_check",
            Level::NotIdentified => "not_identified",
        }
    }
}

/// One ranked candidate (a spectrum of an active library).
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    /// Global row in the index.
    pub g: usize,
    pub r_derivative: f64,
    pub r_spectrum: f64,
    pub coverage: f64,
    /// r of the derivative in each fixed region; `None` = too few points.
    pub r_regions: Vec<(String, Option<f64>)>,
    /// State of each region (`agrees`, `partial`, `disagrees`, `low_signal`, `unknown`).
    pub region_states: Vec<(String, &'static str)>,
}

/// An alert with the data that made it fire.
#[derive(Debug, Clone, PartialEq)]
pub struct Alert {
    pub id: &'static str,
    pub data: Vec<(String, Value)>,
}

#[derive(Debug, Clone)]
pub struct Outcome {
    pub candidates: Vec<Candidate>,
    pub margin: Option<f64>,
    pub margin_vs: Option<(usize, f64)>,
    pub level: Level,
    pub level_caps: Vec<&'static str>,
    /// Share (0-1) of the sample derivative energy that falls in each explanation region.
    pub region_signal: Vec<(String, f64)>,
    pub alerts: Vec<Alert>,
    pub ranges: Vec<(f64, f64)>,
    pub range_preset: Option<String>,
    pub query_role: Role,
    pub origin: Option<String>,
    pub searched: Vec<usize>,
    pub thresholds_version: u32,
    pub region_agreement: soglie::RegionAgreement,
}

fn num(x: f64) -> Value {
    if x.is_finite() {
        Value::Num(x)
    } else {
        Value::Null
    }
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

fn role_id(r: Role) -> &'static str {
    match r {
        Role::Sample => "sample",
        Role::Reference => "reference",
        Role::Residual => "residual",
        Role::Subtraction => "subtraction",
        Role::Mean => "mean",
    }
}

fn candidate_json(rank: usize, c: &Candidate, index: &Index) -> Value {
    let (li, _) = index.locate(c.g);
    let (lib, e) = (&index.libs[li], index.entry(c.g));
    let regions = c
        .r_regions
        .iter()
        .map(|(k, r)| (k.clone(), r.map_or(Value::Null, num)))
        .collect();
    Value::Obj(vec![
        ("rank".into(), Value::Num(rank as f64)),
        ("spectrum_id".into(), text(&e.id)),
        (
            "substance".into(),
            e.substance.as_deref().map_or(Value::Null, text),
        ),
        ("display_name".into(), text(&e.display_name)),
        ("form".into(), text(&e.form)),
        ("library".into(), text(&lib.id)),
        ("library_version".into(), text(&lib.version)),
        ("r_derivative".into(), num(c.r_derivative)),
        ("r_spectrum".into(), num(c.r_spectrum)),
        (
            "hqi_euclidean".into(),
            num(super::hqi::from_r(c.r_derivative)),
        ),
        ("coverage".into(), num(c.coverage)),
        ("r_regions".into(), Value::Obj(regions)),
        (
            "region_states".into(),
            Value::Obj(
                c.region_states
                    .iter()
                    .map(|(k, s)| (k.clone(), text(s)))
                    .collect(),
            ),
        ),
    ])
}

fn chain_json() -> Value {
    let a = asls::DEFAULT;
    let baseline = Value::Obj(vec![
        ("id".into(), text("asls")),
        ("lam".into(), Value::Num(a.lam)),
        ("p".into(), Value::Num(a.p)),
        ("max_iter".into(), Value::Num(a.max_iter as f64)),
        ("tol".into(), Value::Num(a.tol)),
    ]);
    Value::Obj(vec![
        ("derivative".into(), text("confronto_v1")),
        ("spectrum".into(), text("confronto_spettro_v1")),
        ("baseline".into(), baseline),
        ("cache_version".into(), Value::Num(f64::from(CACHE_VERSION))),
    ])
}

fn ranges_json(r: &[(f64, f64)]) -> Value {
    Value::Arr(
        r.iter()
            .map(|(a, b)| Value::Arr(vec![Value::Num(*a), Value::Num(*b)]))
            .collect(),
    )
}
