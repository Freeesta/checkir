//! `confronta`: one query against all active libraries together. Candidates are ranked by `pearson_derivata/1`;
//! `pearson_spettro/1` is scored beside it (never part of the level rule) and `pearson_regioni/1` explains the top ten.
use super::controlli::quality_alerts;
use super::indice::Index;
use super::livello::{alert, build_alerts, propose, sampling_differs, AlertInput};
use super::opzioni::Options;
use super::pearson::pearson;
use super::punteggio::{score, RowRef, Selection};
use super::risultato::{Alert, Candidate, Outcome};
use super::soglie::Thresholds;
use super::{grid_absorbance, grid_x, prepare, GRID_STEP_CM1};
use crate::error::{EngineError, EngineResult};
use crate::passi::json::Value;
use crate::spectrum::{Role, Spectrum};
use std::cmp::Ordering;
use std::collections::HashMap;

/// Candidates listed.
pub const TOP: usize = 10;
/// Fewest points for the r of an explanation region to be shown.
const MIN_REGION_POINTS: usize = 20;

/// Rows folded into a candidate as `(global row, r)`.
type Absorbed = Vec<(usize, f64)>;

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

/// Share (0-1) of the energy of the sample derivative that falls in each explanation region (energy = sum of the
/// squares over the points of the comparison, the diamond zone excluded).
fn region_signal(deriv: &[f64], t: &Thresholds) -> Vec<(String, f64)> {
    let energy = |from: f64, to: f64| -> f64 {
        deriv
            .iter()
            .enumerate()
            .filter(|(i, v)| v.is_finite() && (from..=to).contains(&grid_x(*i)))
            .map(|(_, v)| v * v)
            .sum()
    };
    let total = energy(f64::MIN, f64::MAX);
    t.regions
        .iter()
        .map(|r| {
            let share = if total > 0.0 {
                energy(r.from_cm1, r.to_cm1) / total
            } else {
                0.0
            };
            (r.id.clone(), share)
        })
        .collect()
}

fn region_states(
    r_regions: &[(String, Option<f64>)],
    signal: &[(String, f64)],
    t: &Thresholds,
) -> Vec<(String, &'static str)> {
    r_regions
        .iter()
        .zip(signal)
        .map(|((id, r), (_, share))| (id.clone(), t.region_agreement.state(*r, *share)))
        .collect()
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

/// The best `TOP` rows with one entry per identity and form: a row with an InChIKey or a substance id that repeats the
/// identity and form of a better one (the same substance in another library) joins that one's list. Rows with no
/// identity are never merged here. Returns the kept rows (indices into `rows`) and, for each, the rows it absorbed.
fn one_per_identity(
    index: &Index,
    rows: &[Scored],
    sorted: &[usize],
) -> (Vec<usize>, Vec<Absorbed>) {
    let mut kept: Vec<usize> = Vec::new();
    let mut same: Vec<Absorbed> = Vec::new();
    let mut seen: HashMap<(u32, String), usize> = HashMap::new();
    for i in sorted {
        let s = &rows[*i];
        let e = index.entry(s.g);
        let has_identity = e.inchikey.is_some() || e.substance.is_some();
        let key = (index.group[s.g], e.form.to_lowercase());
        if let Some(k) = has_identity.then(|| seen.get(&key)).flatten() {
            same[*k].push((s.g, s.r));
            continue;
        }
        if kept.len() == TOP {
            continue; // later rows only matter when they join a kept one (above)
        }
        if has_identity {
            seen.insert(key, kept.len());
        }
        kept.push(*i);
        same.push(Vec::new());
    }
    (kept, same)
}

/// Score every row of the searched libraries on the derivative and on the baseline-corrected spectrum.
fn score_all(index: &Index, sel: (&Selection, &Selection), searched: &[usize]) -> Vec<Scored> {
    let mut rows = Vec::new();
    for li in searched {
        for g in index.lib_range(*li) {
            let (r, coverage) = score(sel.0, rows_of(index, g, false));
            let r_spectrum = score(sel.1, rows_of(index, g, true)).0;
            rows.push(Scored {
                g,
                r,
                r_spectrum,
                coverage,
            });
        }
    }
    rows
}

/// The ranked candidates with their regional r and the state of each region.
fn candidates_of(
    index: &Index,
    rows: &[Scored],
    (order, same): (&[usize], &[Absorbed]),
    sample: (&[f64], &[(String, f64)]),
    t: &Thresholds,
) -> Vec<Candidate> {
    order
        .iter()
        .zip(same)
        .map(|(i, same_substance)| {
            let s = &rows[*i];
            let r_regions = regions(index, sample.0, s.g, t);
            Candidate {
                region_states: region_states(&r_regions, sample.1, t),
                g: s.g,
                r_derivative: s.r,
                r_spectrum: s.r_spectrum,
                coverage: s.coverage,
                same_substance: same_substance.clone(),
                r_regions,
            }
        })
        .collect()
}

/// The alerts about the measurement: `same_as_previous` (r of the derivative with the sample before it in the session
/// at or over the threshold) and the `quality_*` ones.
fn measurement_alerts(
    query: &Spectrum,
    p: &super::Prepared,
    previous: Option<&[f64]>,
    t: &Thresholds,
) -> Vec<Alert> {
    let mut out = Vec::new();
    let r = previous.and_then(|v| pearson(&p.deriv, v, None));
    if let Some(r) = r.filter(|r| *r >= t.same_as_previous_r) {
        out.push(alert(
            "same_as_previous",
            vec![
                ("r", Value::Num(r)),
                ("limit", Value::Num(t.same_as_previous_r)),
            ],
        ));
    }
    if query.role == Role::Sample {
        if let Some(grid) = grid_absorbance(query) {
            out.extend(quality_alerts(&grid, &p.spec, t));
        }
    }
    out
}

/// Compare `query` with the rows of the active libraries of `index`.
pub fn search(
    index: &Index,
    query: &Spectrum,
    o: &Options,
    t: &Thresholds,
) -> EngineResult<Outcome> {
    search_with(index, query, o, t, None)
}

/// `search`, also telling whether the sample repeats the one before it: `previous` = derivative vector of that sample.
pub fn search_with(
    index: &Index,
    query: &Spectrum,
    o: &Options,
    t: &Thresholds,
    previous: Option<&[f64]>,
) -> EngineResult<Outcome> {
    let searched = active_libraries(index, o)?;
    let p = prepare(query)?;
    let ranges = (!o.ranges.is_empty()).then_some(o.ranges.as_slice());
    let (sel_d, sel_s) = (
        Selection::new(&p.deriv, ranges),
        Selection::new(&p.spec, ranges),
    );
    check_range(&sel_d, t)?;
    let rows = score_all(index, (&sel_d, &sel_s), &searched);
    let mut sorted: Vec<usize> = (0..rows.len()).collect();
    sorted.sort_by(|a, b| by_rank(&rows[*a], &rows[*b]));
    let (order, same) = one_per_identity(index, &rows, &sorted);
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
    let signal = region_signal(&p.deriv, t);
    let candidates = candidates_of(index, &rows, (&order, &same), (&p.deriv, &signal), t);
    let top_library = index.libs[index.locate(top.g).0].sampling.as_deref();
    let (level, level_caps) = propose(
        top.r,
        margin,
        top.coverage,
        sampling_differs(o, top_library),
        o,
        t,
    );
    let measurement = measurement_alerts(query, &p, previous, t);
    let input = AlertInput {
        index,
        candidates: &candidates,
        margin,
        second,
        spectrum_top,
        options: o,
        thresholds: t,
        searched: &searched,
        measurement: &measurement,
    };
    let alerts = build_alerts(&input);
    Ok(Outcome {
        candidates,
        margin,
        margin_vs: second,
        level,
        level_caps,
        region_signal: signal,
        alerts,
        ranges: o.ranges.clone(),
        range_preset: o.range_preset.clone(),
        query_role: query.role,
        origin: o.origin.clone(),
        sample_sampling: o.sampling.clone(),
        searched,
        thresholds_version: t.version,
        region_agreement: t.region_agreement,
    })
}
