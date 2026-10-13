//! The search itself: candidates by bisection on the sorted rows, absences, ranking. `PeakIndex::query_linear` scans every row
//! instead and is the reference the tests compare with.
use super::query::{better, check, class_tolerance, Absent, Found, Hit, Query, QueryResult};
use super::{PeakIndex, Row, MIN_PROMINENCE_REL};
use crate::error::EngineResult;
use crate::peaks::thresholds::Tolerances;
use std::collections::{BTreeMap, HashSet};

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
