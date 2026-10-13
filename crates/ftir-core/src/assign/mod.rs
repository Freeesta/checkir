//! Peak assignment (package ASSIGNMENT), `assignment/1`: which peaks of the sample a reference spectrum explains and
//! which stay unexplained. Only a substance (the candidate or a component) explains a peak; the program proposes, the
//! chemist decides. Every limit comes from `peaks_thresholds/1` (the tolerances); no wavenumber is written here.
//!
//! Without any reference the summary says so and does not count unexplained peaks.
use crate::error::EngineResult;
use crate::passi::json::{self, Value};
use crate::peaks::result::{Kind, Peak, Shape, Tier};
use crate::peaks::Thresholds;

pub mod input;
pub mod result;
mod to_json;

pub use input::PeakSet;
use result::{Assignment, Explanation, Item, Missing, ReferenceId, State, Summary};

/// Share of the highest band above which a reference peak missing from the sample is reported as expected.
/// TODO(coordinator): move to `peaks_thresholds/1` (a data file outside this package) as `tolerances.missing_rel_min`.
pub const MISSING_REL_MIN: f64 = 0.2;

/// A reference spectrum seen through its peaks. `same_form` is false for another form of the same substance
/// (salt against base): it still explains a peak, but with a warning.
#[derive(Debug, Clone)]
pub struct Reference {
    pub id: ReferenceId,
    pub peaks: PeakSet,
    pub same_form: bool,
}

fn tolerance(t: &Thresholds, shape: Option<Shape>) -> f64 {
    let same = &t.tolerances.same_peak_cm1;
    match shape {
        Some(Shape::Narrow) => same[0],
        None | Some(Shape::Medium) => same[1],
        Some(Shape::Broad | Shape::VeryBroad) => same[2],
    }
}

/// Peaks that can explain or be explained: artifacts of the instrument never do.
fn usable(p: &Peak) -> bool {
    p.artifact.is_none()
}

/// The nearest peak of `others` within the tolerance of the pair (the wider of the two shapes).
fn nearest<'a>(p: &Peak, others: &'a [Peak], t: &Thresholds) -> Option<(&'a Peak, f64)> {
    others
        .iter()
        .filter(|q| usable(q))
        .map(|q| (q, q.position_cm1 - p.position_cm1))
        .filter(|(q, d)| d.abs() <= tolerance(t, p.shape).max(tolerance(t, q.shape)))
        .min_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
}

fn explanation(r: &Reference, q: &Peak, delta: f64) -> Explanation {
    Explanation {
        substance_id: r.id.substance_id.clone(),
        form: r.id.form.clone(),
        ref_peak_id: q.id.clone(),
        ref_peak_cm1: q.position_cm1,
        delta_cm1: delta,
    }
}

/// The best explanation of `p`: the nearest peak among the references of the same form, else among the other forms.
fn explain(p: &Peak, refs: &[Reference], t: &Thresholds) -> Option<(State, Explanation)> {
    let best = |same: bool| {
        refs.iter()
            .filter(|r| r.same_form == same)
            .filter_map(|r| nearest(p, &r.peaks.peaks, t).map(|(q, d)| (r, q, d)))
            .min_by(|a, b| a.2.abs().total_cmp(&b.2.abs()))
    };
    if let Some((r, q, d)) = best(true) {
        return Some((State::Explained, explanation(r, q, d)));
    }
    best(false).map(|(r, q, d)| (State::ExplainedOtherForm, explanation(r, q, d)))
}

/// Unexplained needs a prominence of at least `tiers.unexplained_rel_min` of the highest band and `detect.
/// prominence_noise_ratio` times the noise; below that the peak is only minor. A shoulder has no valley, so whether it
/// shows depends on the resolution and the instrument: it can be explained but never counts as unexplained.
fn significant(p: &Peak, noise_abs: f64, t: &Thresholds) -> bool {
    p.kind == Kind::Peak
        && p.prominence_rel >= t.tiers.unexplained_rel_min
        && p.prominence_abs >= t.detect.prominence_noise_ratio * noise_abs
}

fn item(p: &Peak, sample: &PeakSet, refs: &[Reference], t: &Thresholds) -> Item {
    let (state, explained_by) = if p.artifact.is_some() {
        (State::Artifact, None)
    } else if let Some((state, by)) = explain(p, refs, t) {
        (state, Some(by))
    } else if significant(p, sample.noise_abs, t) {
        (State::Unexplained, None)
    } else {
        (State::Minor, None)
    };
    Item {
        peak_id: p.id.clone(),
        state,
        explained_by,
    }
}

/// Peaks of the candidate (the first reference) that the sample lacks.
fn missing(sample: &PeakSet, candidate: &Reference, t: &Thresholds) -> Vec<Missing> {
    candidate
        .peaks
        .peaks
        .iter()
        .filter(|q| usable(q) && q.kind == Kind::Peak && q.prominence_rel >= MISSING_REL_MIN)
        .filter(|q| nearest(q, &sample.peaks, t).is_none())
        .map(|q| Missing {
            ref_peak_id: q.id.clone(),
            ref_peak_cm1: q.position_cm1,
            prominence_rel: q.prominence_rel,
        })
        .collect()
}

fn summary(sample: &PeakSet, items: &[Item], missing: usize, has_ref: bool) -> Summary {
    let count = |f: &dyn Fn(&Item) -> bool| items.iter().filter(|i| f(i)).count();
    let n_main = sample
        .peaks
        .iter()
        .filter(|p| p.tier == Tier::Main && p.artifact.is_none())
        .count();
    Summary {
        no_reference: !has_ref,
        n_main,
        n_explained: count(&|i| i.explained_by.is_some()),
        n_unexplained: has_ref.then(|| count(&|i| i.state == State::Unexplained)),
        n_missing: missing,
    }
}

/// Assigns the peaks of `sample`. `references[0]` is the candidate (its missing bands are reported); the others are
/// components of a mixture or other forms of the same substance. An empty list means no reference was chosen.
pub fn assign(sample: &PeakSet, references: &[Reference], t: &Thresholds) -> Assignment {
    let items: Vec<Item> = sample
        .peaks
        .iter()
        .map(|p| item(p, sample, references, t))
        .collect();
    let lacking = references
        .first()
        .map_or_else(Vec::new, |c| missing(sample, c, t));
    Assignment {
        sample_spectrum_id: sample.spectrum_id.clone(),
        reference: references.first().map(|r| r.id.clone()),
        components: references.iter().skip(1).map(|r| r.id.clone()).collect(),
        summary: summary(sample, &items, lacking.len(), !references.is_empty()),
        items,
        missing_expected: lacking,
    }
}

fn reference_of(v: &Value) -> EngineResult<Reference> {
    let text = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let peaks = v.get("peaks").map(Value::write).unwrap_or_default();
    let set = PeakSet::parse(&peaks)?;
    Ok(Reference {
        id: ReferenceId {
            spectrum_id: set.spectrum_id.clone(),
            substance_id: text("substance_id").unwrap_or_default(),
            form: text("form").unwrap_or_default(),
            library: text("library"),
            version: text("version"),
        },
        peaks: set,
        same_form: !matches!(v.get("same_form"), Some(Value::Bool(false))),
    })
}

/// `assign` on JSON: `sample_peaks_json` is `peaks/1`; `references_json` is an array of `{substance_id, form, library?,
/// version?, same_form?, peaks: peaks/1}` (candidate first). Empty `thresholds_json` = the embedded file. Returns
/// `assignment/1` as JSON text.
pub fn assign_json(
    sample_peaks_json: &str,
    references_json: &str,
    thresholds_json: &str,
) -> EngineResult<String> {
    let t = if thresholds_json.trim().is_empty() {
        Thresholds::embedded()?
    } else {
        Thresholds::parse(thresholds_json)?
    };
    let sample = PeakSet::parse(sample_peaks_json)?;
    let parsed = json::parse(references_json)?;
    let refs = parsed
        .as_arr()
        .unwrap_or_default()
        .iter()
        .map(reference_of)
        .collect::<EngineResult<Vec<_>>>()?;
    Ok(assign(&sample, &refs, &t).to_json())
}

impl Reference {
    /// A reference of the same form from a detected `PeakList`.
    pub fn new(id: ReferenceId, peaks: PeakSet) -> Self {
        Reference {
            id,
            peaks,
            same_form: true,
        }
    }
}
