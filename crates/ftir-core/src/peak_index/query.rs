//! Queries on the peak index: bands wanted (AND) and ranges that must stay empty (NOT). Candidates come from a bisection
//! on the sorted rows; `PeakIndex::query_linear` scans every row instead and is the reference the tests compare with.
use super::{PeakIndex, Row, MIN_PROMINENCE_REL, WIDTH_NAMES};
use crate::error::{EngineError, EngineResult};
use crate::passi::json::Value;
use crate::peaks::thresholds::Tolerances;
use std::collections::{BTreeMap, HashSet};

pub const DEFAULT_LIMIT: usize = 200;

#[derive(Debug, Clone, PartialEq)]
pub struct Want {
    pub position_cm1: f64,
    /// `None` = the tolerance of the width class of the band found in the library.
    pub tolerance_cm1: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Absent {
    pub from_cm1: f64,
    pub to_cm1: f64,
    pub min_prominence_rel: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub wanted: Vec<Want>,
    pub absent: Vec<Absent>,
    /// Bands that must be found; `None` = all of them (AND).
    pub min_found: Option<usize>,
    pub limit: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub wanted: usize,
    pub row: Row,
    pub delta_cm1: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub spectrum: u32,
    pub found: Vec<Found>,
}

impl Hit {
    fn prominence_sum(&self) -> u32 {
        self.found.iter().map(|f| u32::from(f.row.prominence)).sum()
    }

    fn delta_sum(&self) -> f64 {
        self.found.iter().map(|f| f.delta_cm1).sum()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct QueryResult {
    /// Spectra that satisfy the query (before `limit`).
    pub total: usize,
    /// Bands a spectrum needed to be listed.
    pub required: usize,
    pub hits: Vec<Hit>,
}

fn invalid(what: &str) -> EngineError {
    EngineError::new("peak_index.query_invalid", "invalid peak query").with_param("what", what)
}

fn check(q: &Query) -> EngineResult<()> {
    let pos_ok = |x: f64| x.is_finite() && (0.0..=6553.5).contains(&x);
    if q.wanted.is_empty() {
        return Err(invalid("no_peaks"));
    }
    for w in &q.wanted {
        let tol_ok = w.tolerance_cm1.is_none_or(|t| t.is_finite() && t > 0.0);
        if !pos_ok(w.position_cm1) || !tol_ok {
            return Err(invalid("peak"));
        }
    }
    for a in &q.absent {
        if !pos_ok(a.from_cm1) || !pos_ok(a.to_cm1) || a.from_cm1 > a.to_cm1 {
            return Err(invalid("absent"));
        }
    }
    Ok(())
}

/// Tolerance of a band of width class `width`: narrow/medium/broad from the thresholds, very broad as broad.
fn class_tolerance(t: &Tolerances, width: u8) -> f64 {
    t.same_peak_cm1[usize::from(width).min(2)]
}

fn better(a: &Found, b: &Found) -> bool {
    (a.row.prominence, std::cmp::Reverse(a.delta_cm1.to_bits()))
        > (b.row.prominence, std::cmp::Reverse(b.delta_cm1.to_bits()))
}

impl PeakIndex {
    /// Rows whose position lies in `[from, to]` cm⁻¹: a bisection, or every row when `scan` is true (the reference).
    fn window(&self, from: f64, to: f64, scan: bool) -> &[Row] {
        if scan {
            return self.rows();
        }
        let lo = (from * 10.0).floor().max(0.0);
        let hi = (to * 10.0).ceil();
        let start = self.rows().partition_point(|r| f64::from(r.pos10) < lo);
        let end = self.rows().partition_point(|r| f64::from(r.pos10) <= hi);
        &self.rows()[start..end.max(start)]
    }

    fn candidates(
        &self,
        q: &Query,
        tol: &Tolerances,
        scan: bool,
    ) -> BTreeMap<u32, Vec<Option<Found>>> {
        let widest = tol.same_peak_cm1.iter().copied().fold(0.0, f64::max);
        let mut by_spectrum: BTreeMap<u32, Vec<Option<Found>>> = BTreeMap::new();
        for (i, w) in q.wanted.iter().enumerate() {
            let reach = w.tolerance_cm1.unwrap_or(widest);
            for row in self.window(w.position_cm1 - reach, w.position_cm1 + reach, scan) {
                let delta = (row.position_cm1() - w.position_cm1).abs();
                let limit = w
                    .tolerance_cm1
                    .unwrap_or_else(|| class_tolerance(tol, row.width));
                if delta > limit + 1e-9 {
                    continue;
                }
                let found = Found {
                    wanted: i,
                    row: *row,
                    delta_cm1: delta,
                };
                let slot = &mut by_spectrum
                    .entry(row.spectrum)
                    .or_insert_with(|| vec![None; q.wanted.len()])[i];
                if slot.as_ref().is_none_or(|old| better(&found, old)) {
                    *slot = Some(found);
                }
            }
        }
        by_spectrum
    }

    /// Spectra with a band inside one of the ranges that must stay empty.
    fn with_forbidden(&self, absent: &[Absent], scan: bool) -> HashSet<u32> {
        let mut out = HashSet::new();
        for a in absent {
            let floor = (a.min_prominence_rel.max(MIN_PROMINENCE_REL) * 255.0).round();
            for r in self.window(a.from_cm1, a.to_cm1, scan) {
                let inside = r.position_cm1() >= a.from_cm1 && r.position_cm1() <= a.to_cm1;
                if inside && f64::from(r.prominence) >= floor {
                    out.insert(r.spectrum);
                }
            }
        }
        out
    }

    fn run(&self, q: &Query, tol: &Tolerances, scan: bool) -> EngineResult<QueryResult> {
        check(q)?;
        let required = q
            .min_found
            .unwrap_or(q.wanted.len())
            .clamp(1, q.wanted.len());
        let forbidden = self.with_forbidden(&q.absent, scan);
        let mut hits: Vec<Hit> = self
            .candidates(q, tol, scan)
            .into_iter()
            .filter(|(s, _)| !forbidden.contains(s))
            .map(|(spectrum, slots)| Hit {
                spectrum,
                found: slots.into_iter().flatten().collect(),
            })
            .filter(|h| h.found.len() >= required)
            .collect();
        hits.sort_by(|a, b| {
            b.found
                .len()
                .cmp(&a.found.len())
                .then(b.prominence_sum().cmp(&a.prominence_sum()))
                .then(a.delta_sum().total_cmp(&b.delta_sum()))
                .then(a.spectrum.cmp(&b.spectrum))
        });
        let total = hits.len();
        hits.truncate(q.limit);
        Ok(QueryResult {
            total,
            required,
            hits,
        })
    }

    /// Answer by bisection. Order: bands found, summed prominence in the library spectrum, summed |Δ|, spectrum index.
    pub fn query(&self, q: &Query, tol: &Tolerances) -> EngineResult<QueryResult> {
        self.run(q, tol, false)
    }

    /// Same answer by scanning every row (reference for the tests, never used by the page).
    pub fn query_linear(&self, q: &Query, tol: &Tolerances) -> EngineResult<QueryResult> {
        self.run(q, tol, true)
    }
}

fn num(x: f64, decimals: i32) -> Value {
    let k = 10f64.powi(decimals);
    Value::Num((x * k).round() / k)
}

impl QueryResult {
    pub fn to_json(&self) -> String {
        let hit = |h: &Hit| {
            let bands = h.found.iter().map(|f| {
                Value::Obj(vec![
                    ("wanted".into(), Value::Num(f.wanted as f64)),
                    ("position_cm1".into(), num(f.row.position_cm1(), 1)),
                    ("prominence_rel".into(), num(f.row.prominence_rel(), 3)),
                    ("delta_cm1".into(), num(f.delta_cm1, 1)),
                    (
                        "width".into(),
                        Value::Str(WIDTH_NAMES[usize::from(f.row.width).min(3)].into()),
                    ),
                ])
            });
            Value::Obj(vec![
                ("spectrum".into(), Value::Num(f64::from(h.spectrum))),
                ("found".into(), Value::Num(h.found.len() as f64)),
                ("bands".into(), Value::Arr(bands.collect())),
            ])
        };
        Value::Obj(vec![
            ("total".into(), Value::Num(self.total as f64)),
            ("required".into(), Value::Num(self.required as f64)),
            (
                "hits".into(),
                Value::Arr(self.hits.iter().map(hit).collect()),
            ),
        ])
        .write()
    }
}

/// Reads a query from JSON `{peaks:[{position_cm1, tolerance_cm1?}], absent?:[{from_cm1,to_cm1,min_prominence_rel?}],
/// min_found?, limit?}`.
pub fn parse_query(text: &str) -> EngineResult<Query> {
    let v = crate::passi::json::parse(text)?;
    let f = |v: &Value, k: &str| v.get(k).and_then(Value::as_f64);
    let list = |k: &str| v.get(k).and_then(Value::as_arr).unwrap_or_default();
    let wanted = list("peaks")
        .iter()
        .map(|p| {
            f(p, "position_cm1")
                .map(|position_cm1| Want {
                    position_cm1,
                    tolerance_cm1: f(p, "tolerance_cm1"),
                })
                .ok_or_else(|| invalid("peak"))
        })
        .collect::<EngineResult<Vec<_>>>()?;
    let absent = list("absent")
        .iter()
        .map(|a| match (f(a, "from_cm1"), f(a, "to_cm1")) {
            (Some(from_cm1), Some(to_cm1)) => Ok(Absent {
                from_cm1,
                to_cm1,
                min_prominence_rel: f(a, "min_prominence_rel").unwrap_or(MIN_PROMINENCE_REL),
            }),
            _ => Err(invalid("absent")),
        })
        .collect::<EngineResult<Vec<_>>>()?;
    let count = |k: &str| f(&v, k).filter(|x| *x >= 0.0).map(|x| x as usize);
    Ok(Query {
        wanted,
        absent,
        min_found: count("min_found"),
        limit: count("limit").unwrap_or(DEFAULT_LIMIT),
    })
}
