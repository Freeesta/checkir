//! Interpretations (group rules of `bands/2`) of a peak. A rule interprets, it never explains: only a substance does.
//! Order: (a) diagnostic for a class of the candidate, (b) more conditions satisfied, (c) the
//! narrower interval, (d) intensity compatible with the peak. No number is shown, only the order.
use super::result::Interpretation;
use super::rules::{Intensity, Rule, RuleSet, Width};
use super::{tolerance, usable, PeakSet, FINGERPRINT_BELOW_CM1};
use crate::passi::json::Value;
use crate::peaks::result::{Peak, Shape};
use crate::peaks::Thresholds;
use std::cmp::Ordering;

pub struct Reading<'a> {
    pub rules: &'a RuleSet,
    pub sample: &'a PeakSet,
    pub t: &'a Thresholds,
    pub classes: &'a [String],
    pub has_reference: bool,
}

/// A rule of the right interval and width whose conditions hold, with what ranks it.
struct Hit<'a> {
    rule: &'a Rule,
    class_match: bool,
    satisfied: usize,
    intensity_ok: bool,
}

fn width_ok(rule: &Rule, shape: Option<Shape>) -> bool {
    match (rule.width, shape) {
        (Width::Any, _) | (_, None) => true,
        (Width::Sharp, Some(s)) => matches!(s, Shape::Narrow | Shape::Medium),
        (Width::Broad, Some(s)) => matches!(s, Shape::Broad | Shape::VeryBroad),
    }
}

fn intensity_ok(rule: &Rule, p: &Peak, t: &Thresholds) -> bool {
    let class = if p.prominence_rel >= t.tolerances.strong_rel_min {
        Intensity::Strong
    } else if p.prominence_rel >= t.tolerances.medium_rel_min {
        Intensity::Medium
    } else {
        Intensity::Weak
    };
    rule.intensity == Intensity::Variable || rule.intensity == class
}

fn compare(a: &Hit, b: &Hit) -> Ordering {
    b.class_match
        .cmp(&a.class_match)
        .then(b.satisfied.cmp(&a.satisfied))
        .then(a.rule.width_cm1().total_cmp(&b.rule.width_cm1()))
        .then(b.intensity_ok.cmp(&a.intensity_ok))
        .then(a.rule.id.cmp(&b.rule.id))
}

impl Reading<'_> {
    /// Is a peak of the sample inside the interval of rule `id` (widths and conditions of that rule not looked at)?
    fn satisfied(&self, id: &str) -> bool {
        let Some(r) = self.rules.get(id) else {
            return false;
        };
        let peaks = &self.sample.peaks;
        peaks
            .iter()
            .any(|q| usable(q) && r.contains(q.position_cm1, tolerance(self.t, q.shape)))
    }

    /// Number of satisfied `requires` if the conditions hold, `None` if a rule must be discarded.
    fn conditions(&self, r: &Rule) -> Option<usize> {
        let all = r.requires_all.iter().filter(|i| self.satisfied(i)).count();
        let any = r.requires_any.iter().filter(|i| self.satisfied(i)).count();
        let ok = all == r.requires_all.len()
            && (r.requires_any.is_empty() || any > 0)
            && !r.excludes.iter().any(|i| self.satisfied(i));
        ok.then_some(all + any)
    }

    fn hit<'r>(&self, r: &'r Rule, p: &Peak, named: &[String]) -> Option<Hit<'r>> {
        let tol = tolerance(self.t, p.shape);
        let in_fingerprint = p.position_cm1 < FINGERPRINT_BELOW_CM1;
        let allowed = (!r.candidate_only || named.contains(&r.group))
            && (self.has_reference || !in_fingerprint || !r.diagnostic_for.is_empty());
        if !(allowed && r.contains(p.position_cm1, tol) && width_ok(r, p.shape)) {
            return None;
        }
        Some(Hit {
            rule: r,
            class_match: r.diagnostic_for.iter().any(|c| self.classes.contains(c)),
            satisfied: self.conditions(r)?,
            intensity_ok: intensity_ok(r, p, self.t),
        })
    }

    /// The ranked interpretations of `p`, all of them: the caller keeps the first ones and flags a crowded region.
    /// `named` are the groups of the substance bands of a candidate that already explains the peak.
    pub fn of_peak(&self, p: &Peak, named: &[String]) -> Vec<Interpretation> {
        if !usable(p) {
            return Vec::new();
        }
        let mut hits: Vec<Hit> = (self.rules.rules.iter())
            .filter_map(|r| self.hit(r, p, named))
            .collect();
        hits.sort_by(compare);
        (hits.iter().enumerate())
            .map(|(i, h)| Interpretation {
                rule_id: Some(h.rule.id.clone()),
                group: h.rule.group.clone(),
                mode: h.rule.mode.clone(),
                rank: i + 1,
                status: h.rule.status.clone(),
                origin: None,
            })
            .collect()
    }
}

/// The rules compatible with a position, for the inverse search (conditions cannot be judged without a sample):
/// narrower intervals first.
pub fn at_position(rules: &RuleSet, cm1: f64, tol_cm1: f64) -> Vec<&Rule> {
    let mut found: Vec<&Rule> = (rules.rules.iter())
        .filter(|r| r.contains(cm1, tol_cm1))
        .collect();
    found.sort_by(|a, b| {
        a.width_cm1()
            .total_cmp(&b.width_cm1())
            .then(a.id.cmp(&b.id))
    });
    found
}

/// `interpretations_at` on JSON: an array of `{rule_id, group, mode, status, diagnostic_for}`; empty `rules_json` =
/// the embedded rules.
pub fn at_position_json(
    cm1: f64,
    tol_cm1: f64,
    rules_json: &str,
) -> crate::error::EngineResult<String> {
    let rules = if rules_json.trim().is_empty() {
        RuleSet::embedded()?
    } else {
        RuleSet::parse(rules_json)?
    };
    let text = |s: &str| Value::Str(s.to_string());
    let items = at_position(&rules, cm1, tol_cm1).into_iter().map(|r| {
        let classes = r.diagnostic_for.iter().map(|c| text(c)).collect();
        Value::Obj(vec![
            ("rule_id".into(), text(&r.id)),
            ("group".into(), text(&r.group)),
            ("mode".into(), text(&r.mode)),
            ("status".into(), text(&r.status)),
            ("diagnostic_for".into(), Value::Arr(classes)),
        ])
    });
    Ok(Value::Arr(items.collect()).write())
}
