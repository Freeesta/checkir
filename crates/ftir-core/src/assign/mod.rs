//! Peak assignment (package ASSIGNMENT), `assignment/1`: which peaks of the sample a reference spectrum explains and
//! which stay unexplained. Only a substance (the candidate or a component) explains a peak; the program proposes, the
//! chemist decides. Every limit comes from `peaks_thresholds/1` (the tolerances); no wavenumber is written here.
//!
//! Without any reference the summary says so and does not count unexplained peaks.
use crate::error::EngineResult;
use crate::passi::json::{self, Value};
use crate::peaks::result::{Kind, Peak, Shape, Tier};
use crate::peaks::Thresholds;

pub mod context;
pub mod input;
pub mod interpret;
mod link;
pub mod result;
pub mod rules;
mod to_json;

pub use context::Context;
pub use input::PeakSet;
use interpret::Reading;
use result::{
    Assignment, BandInfo, Explanation, Interpretation, Item, Missing, ReferenceId, State, Summary,
};
use rules::RuleSet;

/// Below this wavenumber (the fingerprint region) a rule that is not diagnostic is not shown without a candidate:
/// there the same position fits dozens of groups. TODO(coordinator): move to the thresholds file as well.
pub const FINGERPRINT_BELOW_CM1: f64 = 1500.0;
/// At most this many interpretations and this many suspects per peak; more interpretations flag a crowded region.
pub const MAX_INTERPRETATIONS: usize = 3;
pub const MAX_SUSPECTS: usize = 3;

/// A reference spectrum seen through its peaks. `same_form` is false for another form of the same substance
/// (salt against base): it still explains a peak, but with a warning.
#[derive(Debug, Clone)]
pub struct Reference {
    pub id: ReferenceId,
    pub peaks: PeakSet,
    pub same_form: bool,
}

pub(crate) fn tolerance(t: &Thresholds, shape: Option<Shape>) -> f64 {
    let same = &t.tolerances.same_peak_cm1;
    match shape {
        Some(Shape::Narrow) => same[0],
        None | Some(Shape::Medium) => same[1],
        Some(Shape::Broad | Shape::VeryBroad) => same[2],
    }
}

/// Peaks that can explain or be explained: artifacts of the instrument never do.
pub(crate) fn usable(p: &Peak) -> bool {
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
        band: None,
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

fn state_of(
    p: &Peak,
    sample: &PeakSet,
    refs: &[Reference],
    t: &Thresholds,
) -> (State, Option<Explanation>) {
    if p.artifact.is_some() {
        (State::Artifact, None)
    } else if let Some((state, by)) = explain(p, refs, t) {
        (state, Some(by))
    } else if significant(p, sample.noise_abs, t) {
        (State::Unexplained, None)
    } else {
        (State::Minor, None)
    }
}

/// Adds the assignment of the band of the substance to an explanation, when the data has one. Returns its group.
fn with_band(by: &mut Explanation, ctx: &Context) -> Option<String> {
    let b = link::band_at(ctx, &by.substance_id, &by.form, by.ref_peak_cm1)?;
    by.band = Some(BandInfo {
        group: b.group.clone(),
        mode: b.mode.clone(),
        group_instance: b.group_instance.clone(),
        mode_character: b.mode_character.clone(),
        origin: b.origin.id(),
    });
    Some(b.group.clone())
}

/// What reads a peak without explaining it: assignments of the candidate's bands (for a peak its spectrum does not
/// explain), then the group rules. Ranked, cut to `MAX_INTERPRETATIONS`; the flag says some were left out.
fn readings(
    p: &Peak,
    named: &[String],
    own: Vec<Interpretation>,
    reading: Option<&Reading>,
) -> (Vec<Interpretation>, bool) {
    let mut all = own;
    let generic = reading.map_or_else(Vec::new, |r| r.of_peak(p, named));
    let same = |g: &Interpretation| all.iter().any(|o| o.group == g.group && o.mode == g.mode);
    let generic: Vec<_> = generic.into_iter().filter(|g| !same(g)).collect();
    all.extend(generic);
    let crowded = all.len() > MAX_INTERPRETATIONS;
    all.truncate(MAX_INTERPRETATIONS);
    for (i, r) in all.iter_mut().enumerate() {
        r.rank = i + 1;
    }
    (all, crowded)
}

struct Run<'a> {
    sample: &'a PeakSet,
    refs: &'a [Reference],
    ctx: &'a Context,
    reading: Option<Reading<'a>>,
    t: &'a Thresholds,
}

fn item(p: &Peak, run: &Run) -> Item {
    let (state, mut explained_by) = state_of(p, run.sample, run.refs, run.t);
    let named: Vec<String> = (explained_by.as_mut())
        .and_then(|by| with_band(by, run.ctx))
        .into_iter()
        .collect();
    // The candidate's own assignment of the band comes first, whether or not its spectrum explains the peak.
    let own = match run.refs.first() {
        Some(c) if p.artifact.is_none() => {
            let at = explained_by
                .as_ref()
                .map_or(p.position_cm1, |by| by.ref_peak_cm1);
            let band = link::band_at(run.ctx, &c.id.substance_id, &c.id.form, at);
            band.map(link::from_band).into_iter().collect()
        }
        _ => Vec::new(),
    };
    let (interpretations, crowded) = readings(p, &named, own, run.reading.as_ref());
    let known: Vec<&str> = run
        .refs
        .iter()
        .map(|r| r.id.substance_id.as_str())
        .collect();
    let suspects = match state {
        State::Unexplained => link::suspects(p, run.sample, &run.ctx.cuts, &known, run.t),
        _ => Vec::new(),
    };
    Item {
        peak_id: p.id.clone(),
        state,
        explained_by,
        interpretations,
        crowded,
        suspects,
    }
}

/// Peaks of the candidate (the first reference) that the sample lacks.
fn missing(sample: &PeakSet, candidate: &Reference, t: &Thresholds) -> Vec<Missing> {
    candidate
        .peaks
        .peaks
        .iter()
        .filter(|q| {
            usable(q) && q.kind == Kind::Peak && q.prominence_rel >= t.tolerances.missing_rel_min
        })
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

/// Assigns the peaks of `sample`, without group rules, assignments of bands or cuts.
pub fn assign(sample: &PeakSet, references: &[Reference], t: &Thresholds) -> Assignment {
    assign_with(sample, references, &Context::empty(), t)
}

/// Assigns the peaks of `sample`. `references[0]` is the candidate (its missing bands are reported); the others are
/// components of a mixture or other forms of the same substance. An empty list means no reference was chosen. The
/// context carries the group rules (`ctx.rules`; none = no interpretations), the classes of the candidate, the
/// assignments of the bands of the substances and the diagnostic bands of the cuts.
pub fn assign_with(
    sample: &PeakSet,
    references: &[Reference],
    ctx: &Context,
    t: &Thresholds,
) -> Assignment {
    let reading = ctx.rules.as_ref().map(|rules| Reading {
        rules,
        sample,
        t,
        classes: &ctx.candidate_classes,
        has_reference: !references.is_empty(),
    });
    let run = Run {
        sample,
        refs: references,
        ctx,
        reading,
        t,
    };
    let items: Vec<Item> = sample.peaks.iter().map(|p| item(p, &run)).collect();
    let lacking = (references.first()).map_or_else(Vec::new, |c| missing(sample, c, t));
    Assignment {
        sample_spectrum_id: sample.spectrum_id.clone(),
        bands_version: ctx.rules.as_ref().map(|r| r.version.clone()),
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

/// `assign_with` on JSON: `sample_peaks_json` is `peaks/1`; `references_json` is an array of `{substance_id, form,
/// library?, version?, same_form?, peaks: peaks/1}` (candidate first); `context_json` is `Context::parse`; without `rules`
/// (also when empty) the embedded rules are read. Empty `thresholds_json` = the embedded file. Returns
/// `assignment/1` as JSON text.
pub fn assign_json(
    sample_peaks_json: &str,
    references_json: &str,
    context_json: &str,
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
    let mut ctx = Context::parse(context_json)?;
    if ctx.rules.is_none() {
        ctx.rules = Some(RuleSet::embedded()?);
    }
    Ok(assign_with(&sample, &refs, &ctx, &t).to_json())
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
