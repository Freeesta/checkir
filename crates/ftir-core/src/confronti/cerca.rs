//! `confronta`: one query against all active libraries together. Candidates are ranked by `pearson_derivata/1`;
//! `pearson_spettro/1` is scored beside it (never part of the level rule) and `pearson_regioni/1` explains the top ten.
use super::indice::Index;
use super::livello::{build_alerts, propose, AlertInput};
use super::opzioni::Options;
use super::punteggio::{score, RowRef, Selection};
use super::risultato::{Candidate, Outcome};
use super::soglie::Thresholds;
use super::{prepare, GRID_STEP_CM1};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;
use std::cmp::Ordering;

/// Candidates listed.
pub const TOP: usize = 10;
/// Fewest points for the r of an explanation region to be shown.
const MIN_REGION_POINTS: usize = 20;

/// One scored row of the search.
struct Scored {
    g: usize,
    r: f64,
    r_spectrum: f64,
    coverage: f64,
}

fn by_rank(a: &Scored, b: &Scored) -> Ordering {
    b.r.total_cmp(&a.r).then(a.g.cmp(&b.g))
}

fn active_libraries(index: &Index, o: &Options) -> EngineResult<Vec<usize>> {
    let all: Vec<usize> = (0..index.libs.len()).collect();
    let chosen = match &o.libraries {
        None => all,
        Some(ids) => ids
            .iter()
            .map(|id| {
                index.libs.iter().position(|l| l.id == *id).ok_or_else(|| {
                    EngineError::new("confronti.libreria_sconosciuta", "library not loaded")
                        .with_param("libreria", id)
                })
            })
            .collect::<EngineResult<Vec<_>>>()?,
    };
    if chosen.iter().all(|i| index.libs[*i].is_empty()) {
        return Err(EngineError::new(
            "confronti.nessuna_libreria",
            "no library with spectra to search",
        ));
    }
    Ok(chosen)
}

fn check_range(sel: &Selection, t: &Thresholds) -> EngineResult<()> {
    let cm1 = sel.count as f64 * GRID_STEP_CM1;
    if cm1 < t.min_cm1 || sel.count < t.min_points {
        return Err(EngineError::new(
            "confronti.regione_troppo_stretta",
            "the range is too narrow for a comparison",
        )
        .with_param("cm1", cm1)
        .with_param("punti", sel.count)
        .with_param("minimo_cm1", t.min_cm1)
        .with_param("minimo_punti", t.min_points));
    }
    Ok(())
}

fn rows_of(index: &Index, g: usize, spectrum: bool) -> RowRef<'_> {
    let (li, i) = index.locate(g);
    let m = if spectrum {
        &index.libs[li].spec
    } else {
        &index.libs[li].deriv
    };
    RowRef {
        v: m.row(i),
        p: m.presence(i),
        full: m.full[i],
    }
}

fn regions(index: &Index, deriv: &[f64], g: usize, t: &Thresholds) -> Vec<(String, Option<f64>)> {
    t.regions
        .iter()
        .map(|r| {
            let sel = Selection::new(deriv, Some(&[(r.from_cm1, r.to_cm1)]));
            let r1 =
                (sel.count >= MIN_REGION_POINTS).then(|| score(&sel, rows_of(index, g, false)).0);
            (r.id.clone(), r1)
        })
        .collect()
}

/// Compare `query` with the rows of the active libraries of `index`.
pub fn search(
    index: &Index,
    query: &Spectrum,
    o: &Options,
    t: &Thresholds,
) -> EngineResult<Outcome> {
    let searched = active_libraries(index, o)?;
    let p = prepare(query)?;
    let ranges = (!o.ranges.is_empty()).then_some(o.ranges.as_slice());
    let (sel_d, sel_s) = (
        Selection::new(&p.deriv, ranges),
        Selection::new(&p.spec, ranges),
    );
    check_range(&sel_d, t)?;
    let mut rows: Vec<Scored> = Vec::new();
    for li in &searched {
        for g in index.lib_range(*li) {
            let (r, coverage) = score(&sel_d, rows_of(index, g, false));
            let r_spectrum = score(&sel_s, rows_of(index, g, true)).0;
            rows.push(Scored {
                g,
                r,
                r_spectrum,
                coverage,
            });
        }
    }
    let mut order: Vec<usize> = (0..rows.len()).collect();
    let k = TOP.min(order.len());
    order.select_nth_unstable_by(k - 1, |a, b| by_rank(&rows[*a], &rows[*b]));
    order.truncate(k);
    order.sort_by(|a, b| by_rank(&rows[*a], &rows[*b]));
    let top = &rows[order[0]];
    let second = rows
        .iter()
        .filter(|s| index.group[s.g] != index.group[top.g])
        .min_by(|a, b| by_rank(a, b))
        .map(|s| (s.g, s.r));
    let margin = second.map(|(_, r)| top.r - r);
    let spectrum_top = rows
        .iter()
        .min_by(|a, b| b.r_spectrum.total_cmp(&a.r_spectrum).then(a.g.cmp(&b.g)))
        .map_or((top.g, top.r_spectrum), |s| (s.g, s.r_spectrum));
    let candidates: Vec<Candidate> = order
        .iter()
        .map(|i| {
            let s = &rows[*i];
            Candidate {
                g: s.g,
                r_derivative: s.r,
                r_spectrum: s.r_spectrum,
                coverage: s.coverage,
                r_regions: regions(index, &p.deriv, s.g, t),
            }
        })
        .collect();
    let (level, level_caps) = propose(top.r, margin, top.coverage, o, t);
    let input = AlertInput {
        index,
        candidates: &candidates,
        margin,
        second,
        spectrum_top,
        options: o,
        thresholds: t,
    };
    let alerts = build_alerts(&input);
    Ok(Outcome {
        candidates,
        margin,
        margin_vs: second,
        level,
        level_caps,
        alerts,
        ranges: o.ranges.clone(),
        range_preset: o.range_preset.clone(),
        query_role: query.role,
        origin: o.origin.clone(),
        searched,
        thresholds_version: t.version,
    })
}
