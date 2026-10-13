//! The proposed level and the alerts computed from a comparison. The program proposes; the chemist confirms or changes
//! and signs: there is no "confirmed" level here, and no level or alert uses words of certainty.
use super::famiglie::family_alerts;
use super::indice::Index;
use super::opzioni::Options;
use super::risultato::{Alert, Candidate, Level};
use super::soglie::Thresholds;
use crate::passi::json::Value;

/// True when the sample and the library of the first candidate are both said to be measured with a sampling method
/// and the two differ (e.g. transmission against ATR: bands shift by 2-4 cm⁻¹ and the thresholds do not hold).
pub fn sampling_differs(o: &Options, library: Option<&str>) -> bool {
    match (o.sampling.as_deref().and_then(said), library.and_then(said)) {
        (Some(a), Some(b)) => !a.eq_ignore_ascii_case(b),
        _ => false,
    }
}

/// A sampling method that is actually named (not empty, not `unknown`).
fn said(method: &str) -> Option<&str> {
    let m = method.trim();
    (!m.is_empty() && m != crate::campionamento::UNKNOWN).then_some(m)
}

/// Level from the first candidate's r, the margin over the first different substance and the coverage. A coverage
/// under the threshold, a hand-chosen range, a range without calibration or a different sampling method
/// (`sampling_differs`) cap "probable" at "to check"; the caps that applied are returned (`coverage`,
/// `custom_range`, `range_not_calibrated`, `sampling_not_calibrated`).
pub fn propose(
    r1: f64,
    margin: Option<f64>,
    coverage: f64,
    sampling_differs: bool,
    o: &Options,
    t: &Thresholds,
) -> (Level, Vec<&'static str>) {
    let (pr, pm) = (
        o.probable_r1.unwrap_or(t.probable_r1),
        o.probable_margin.unwrap_or(t.probable_margin),
    );
    let numbers = r1 >= pr && margin.is_some_and(|m| m >= pm);
    if !numbers {
        return (
            if r1 >= t.check_r1 {
                Level::ToCheck
            } else {
                Level::NotIdentified
            },
            Vec::new(),
        );
    }
    let mut caps = Vec::new();
    if coverage < t.probable_coverage {
        caps.push("coverage");
    }
    if o.custom {
        caps.push("custom_range");
    } else if !o.calibrated {
        caps.push("range_not_calibrated");
    }
    if sampling_differs {
        caps.push("sampling_not_calibrated");
    }
    (
        if caps.is_empty() {
            Level::Probable
        } else {
            Level::ToCheck
        },
        caps,
    )
}

/// What the alerts need to know about a finished search.
pub struct AlertInput<'a> {
    pub index: &'a Index,
    pub candidates: &'a [Candidate],
    pub margin: Option<f64>,
    /// Best row of a different substance than the first candidate, with its r.
    pub second: Option<(usize, f64)>,
    /// Best row by `pearson_spettro`, with its r.
    pub spectrum_top: (usize, f64),
    pub options: &'a Options,
    pub thresholds: &'a Thresholds,
    /// Libraries actually searched (positions in the index).
    pub searched: &'a [usize],
    /// Alerts about the measurement itself (same as the previous sample, quality), already in display order.
    pub measurement: &'a [Alert],
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

pub(super) fn row_ref(index: &Index, g: usize, r: f64) -> Value {
    let e = index.entry(g);
    Value::Obj(vec![
        ("library".into(), text(&index.libs[index.locate(g).0].id)),
        ("spectrum_id".into(), text(&e.id)),
        ("display_name".into(), text(&e.display_name)),
        ("form".into(), text(&e.form)),
        ("r".into(), Value::Num(r)),
    ])
}

pub(super) fn alert(id: &'static str, data: Vec<(&str, Value)>) -> Alert {
    Alert {
        id,
        data: data.into_iter().map(|(k, v)| (k.to_string(), v)).collect(),
    }
}

fn ambiguity(a: &AlertInput) -> Option<Alert> {
    let top = a.candidates.first()?;
    let mut reasons = Vec::new();
    if a.margin.is_some_and(|m| m < a.thresholds.ambiguity_margin) {
        reasons.push(text("margin"));
    }
    let spectrum_differs = a.index.group[a.spectrum_top.0] != a.index.group[top.g];
    if spectrum_differs {
        reasons.push(text("spectrum_disagrees"));
    }
    if reasons.is_empty() {
        return None;
    }
    let mut data = vec![
        ("reasons", Value::Arr(reasons)),
        ("margin", a.margin.map_or(Value::Null, Value::Num)),
        ("first", row_ref(a.index, top.g, top.r_derivative)),
    ];
    if let Some((g, r)) = a.second {
        data.push(("second", row_ref(a.index, g, r)));
    }
    if spectrum_differs {
        data.push((
            "spectrum_first",
            row_ref(a.index, a.spectrum_top.0, a.spectrum_top.1),
        ));
    }
    Some(alert("ambiguity", data))
}

fn twin(a: &AlertInput) -> Option<Alert> {
    let top = a.candidates.first()?;
    if top.g >= a.index.twins.done {
        let state = Value::Obj(vec![
            ("done".into(), Value::Num(a.index.twins.done as f64)),
            ("total".into(), Value::Num(a.index.total() as f64)),
        ]);
        return Some(alert(
            "spectral_twin",
            vec![("state", text("computing")), ("progress", state)],
        ));
    }
    let (r, partner) = a.index.twin(top.g)?;
    (r >= a.thresholds.twin_r).then(|| {
        alert(
            "spectral_twin",
            vec![
                ("state", text("ready")),
                ("twin", row_ref(a.index, partner, r)),
            ],
        )
    })
}

fn different_form(a: &AlertInput) -> Option<Alert> {
    let top = a.candidates.first()?;
    let top_form = &a.index.entry(top.g).form;
    let (rank, other) = a.candidates.iter().enumerate().skip(1).find(|(_, c)| {
        a.index.group[c.g] == a.index.group[top.g]
            && a.index.entry(c.g).form != *top_form
            // the same spectrum under another name is a copy, not another form
            && (c.r_derivative - top.r_derivative).abs() > 1e-9
    })?;
    Some(alert(
        "different_form",
        vec![
            ("first", row_ref(a.index, top.g, top.r_derivative)),
            ("other", row_ref(a.index, other.g, other.r_derivative)),
            ("other_rank", Value::Num((rank + 1) as f64)),
        ],
    ))
}

fn normal_form(s: &str) -> String {
    s.trim().to_lowercase()
}

/// The chemist (or the peak analysis) expects a form that the library has not got for the substance of the first
/// candidate: the score is lower than usual and a missing form is not a missing substance.
fn form_absent(a: &AlertInput) -> Option<Alert> {
    let top = a.candidates.first()?;
    let expected = normal_form(a.options.expected_form.as_deref()?);
    if expected.is_empty() {
        return None;
    }
    let mut forms: Vec<String> = a
        .searched
        .iter()
        .flat_map(|li| a.index.lib_range(*li))
        .filter(|g| a.index.group[*g] == a.index.group[top.g])
        .map(|g| a.index.entry(g).form.clone())
        .collect();
    forms.sort();
    forms.dedup();
    if forms.iter().any(|f| normal_form(f) == expected) {
        return None;
    }
    Some(alert(
        "form_absent",
        vec![
            ("expected_form", text(&expected)),
            ("first", row_ref(a.index, top.g, top.r_derivative)),
            (
                "forms_in_library",
                Value::Arr(forms.iter().map(|f| text(f)).collect()),
            ),
        ],
    ))
}

fn custom_range(a: &AlertInput) -> Option<Alert> {
    if !a.options.custom {
        return None;
    }
    let ranges = a
        .options
        .ranges
        .iter()
        .map(|(x, y)| Value::Arr(vec![Value::Num(*x), Value::Num(*y)]))
        .collect();
    Some(alert("custom_range", vec![("ranges", Value::Arr(ranges))]))
}

/// Alerts in display order: ambiguity, spectral twin, different form, form absent, flagged family, same as previous, quality,
/// custom range. The first three only qualify an identification, so they need r₁ at the "to check" threshold.
pub fn build_alerts(a: &AlertInput) -> Vec<Alert> {
    let identified = a
        .candidates
        .first()
        .is_some_and(|c| c.r_derivative >= a.thresholds.check_r1);
    let gated = |x: Option<Alert>| x.filter(|_| identified);
    let mut out: Vec<Alert> = [
        gated(ambiguity(a)),
        gated(twin(a)),
        gated(different_form(a)),
        form_absent(a),
    ]
    .into_iter()
    .flatten()
    .collect();
    out.extend(family_alerts(a.index, a.candidates));
    out.extend(a.measurement.iter().cloned());
    out.extend(custom_range(a));
    out
}

#[cfg(test)]
mod test {
    use super::*;

    fn opts(custom: bool, calibrated: bool) -> Options {
        Options {
            ranges: vec![],
            range_preset: Some("full".into()),
            custom,
            calibrated,
            probable_r1: None,
            probable_margin: None,
            libraries: None,
            origin: None,
            expected_form: None,
            sample_id: None,
            sampling: None,
        }
    }

    #[test]
    fn levels_follow_the_agreed_rules() {
        let t = Thresholds::embedded().unwrap();
        let o = opts(false, true);
        let lvl = |r, m, c| propose(r, m, c, false, &o, &t).0;
        assert_eq!(
            propose(0.96, Some(0.06), 1.0, false, &o, &t),
            (Level::Probable, vec![])
        );
        assert_eq!(lvl(0.96, Some(0.04), 1.0), Level::ToCheck);
        assert_eq!(lvl(0.95, Some(0.05), 1.0), Level::Probable);
        assert_eq!(lvl(0.90, Some(0.5), 1.0), Level::ToCheck);
        assert_eq!(lvl(0.85, None, 1.0), Level::ToCheck);
        assert_eq!(lvl(0.849, Some(0.9), 1.0), Level::NotIdentified);
        assert_eq!(lvl(0.99, None, 1.0), Level::ToCheck);
    }

    #[test]
    fn coverage_custom_ranges_and_uncalibrated_presets_cap_at_to_check() {
        let t = Thresholds::embedded().unwrap();
        let (l, caps) = propose(0.99, Some(0.5), 0.79, false, &opts(false, true), &t);
        assert_eq!((l, caps), (Level::ToCheck, vec!["coverage"]));
        assert_eq!(
            propose(0.99, Some(0.5), 1.0, false, &opts(true, false), &t).1,
            vec!["custom_range"]
        );
        assert_eq!(
            propose(0.99, Some(0.5), 1.0, false, &opts(false, false), &t).1,
            vec!["range_not_calibrated"]
        );
        assert_eq!(
            propose(0.5, Some(0.5), 0.1, false, &opts(true, false), &t),
            (Level::NotIdentified, vec![])
        );
    }
}
