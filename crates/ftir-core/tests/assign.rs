//! Peak assignment (package ASSIGNMENT) on synthetic spectra with known truth: shifted reference, added band, removed
//! band, other form, no reference, and the JSON entry point.
use ftir_core::assign::result::ReferenceId;
use ftir_core::assign::result::State;
use ftir_core::assign::{assign, assign_json, PeakSet, Reference};
use ftir_core::peaks::{detect, detect_json, Thresholds};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type B = (f64, f64, f64);

const BANDS: &[B] = &[
    (3000.0, 20.0, 0.3),
    (1700.0, 8.0, 1.0),
    (1450.0, 10.0, 0.5),
    (1250.0, 6.0, 0.4),
    (1000.0, 12.0, 0.7),
    (800.0, 9.0, 0.35),
];

fn spectrum(bands: &[B], seed: u64) -> Spectrum {
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
        step_cm1: 2.0,
        bands: bands
            .iter()
            .map(|(c, w, h)| Band {
                center_cm1: *c,
                half_width_cm1: *w,
                height: *h,
            })
            .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.04,
        noise: 0.0005,
        seed,
    })
}

fn peaks_of(bands: &[B], seed: u64) -> PeakSet {
    let t = Thresholds::embedded().expect("thresholds");
    PeakSet::from(&detect(&spectrum(bands, seed), &t).expect("detect"))
}

fn id(form: &str) -> ReferenceId {
    ReferenceId {
        spectrum_id: None,
        substance_id: "sub".into(),
        form: form.into(),
        library: None,
        version: None,
    }
}

fn run(sample: &[B], reference: &[B], same_form: bool) -> ftir_core::assign::result::Assignment {
    let t = Thresholds::embedded().expect("thresholds");
    let mut r = Reference::new(id("hcl"), peaks_of(reference, 2));
    r.same_form = same_form;
    assign(&peaks_of(sample, 1), &[r], &t)
}

fn shifted(by: f64) -> Vec<B> {
    BANDS.iter().map(|(c, w, h)| (c + by, *w, *h)).collect()
}

#[test]
fn a_reference_shifted_by_three_wavenumbers_explains_every_peak() {
    let a = run(BANDS, &shifted(3.0), true);
    assert!(!a.items.is_empty());
    for i in &a.items {
        assert_eq!(i.state, State::Explained, "{i:?}");
        let d = i.explained_by.as_ref().expect("explained_by").delta_cm1;
        assert!((d - 3.0).abs() <= 1.0, "delta {d}");
    }
    assert_eq!(a.summary.n_unexplained, Some(0));
    assert!(a.missing_expected.is_empty());
}

#[test]
fn an_added_band_at_thirty_percent_is_the_only_unexplained_peak() {
    let mut sample = BANDS.to_vec();
    sample.push((1100.0, 6.0, 0.3));
    let a = run(&sample, &shifted(3.0), true);
    let un: Vec<_> = a
        .items
        .iter()
        .filter(|i| i.state == State::Unexplained)
        .collect();
    assert_eq!(un.len(), 1, "{a:?}");
    assert_eq!(a.summary.n_unexplained, Some(1));
    assert!(a
        .items
        .iter()
        .filter(|i| i.state != State::Unexplained)
        .all(|i| i.state == State::Explained));
}

#[test]
fn a_removed_band_is_an_expected_missing_band() {
    let sample: Vec<B> = BANDS.iter().copied().filter(|b| b.0 != 1250.0).collect();
    let a = run(&sample, &shifted(3.0), true);
    assert_eq!(a.missing_expected.len(), 1, "{a:?}");
    assert!((a.missing_expected[0].ref_peak_cm1 - 1253.0).abs() <= 1.0);
    assert_eq!(a.summary.n_missing, 1);
    assert_eq!(a.summary.n_unexplained, Some(0));
}

#[test]
fn a_faint_unmatched_peak_is_minor_not_unexplained() {
    let mut sample = BANDS.to_vec();
    sample.push((1100.0, 6.0, 0.03));
    let a = run(&sample, &shifted(3.0), true);
    assert_eq!(a.summary.n_unexplained, Some(0), "{a:?}");
    assert!(a.items.iter().any(|i| i.state == State::Minor), "{a:?}");
}

#[test]
fn another_form_explains_with_its_own_state() {
    let a = run(BANDS, &shifted(3.0), false);
    assert!(
        a.items.iter().all(|i| i.state == State::ExplainedOtherForm),
        "{a:?}"
    );
    assert_eq!(a.summary.n_unexplained, Some(0));
}

#[test]
fn without_a_reference_nothing_is_counted_as_unexplained() {
    let t = Thresholds::embedded().expect("thresholds");
    let a = assign(&peaks_of(BANDS, 1), &[], &t);
    assert!(a.summary.no_reference);
    assert_eq!(a.summary.n_unexplained, None);
    assert!(a.reference.is_none());
    assert!(a.items.iter().any(|i| i.state == State::Unexplained));
    assert!(a.items.iter().all(|i| i.explained_by.is_none()));
}

#[test]
fn json_in_json_out_matches_the_direct_call() {
    let sp = |bands: &[B], seed| {
        let s = spectrum(bands, seed);
        let y: Vec<String> = s.y.iter().map(|v| format!("{v}")).collect();
        let x: Vec<String> = s.wavenumber_cm1.iter().map(|v| format!("{v}")).collect();
        format!(
            r#"{{"wavenumber_cm1":[{}],"y":[{}],"y_unit":"absorbance"}}"#,
            x.join(","),
            y.join(",")
        )
    };
    let sample = detect_json(&sp(BANDS, 1), "").expect("peaks");
    let reference = detect_json(&sp(&shifted(3.0), 2), "").expect("peaks");
    let refs = format!(r#"[{{"substance_id":"sub","form":"hcl","peaks":{reference}}}]"#);
    let out = assign_json(&sample, &refs, "").expect("assign");
    assert!(out.contains(r#""schema":"assignment/1""#), "{out}");
    assert!(out.contains(r#""n_unexplained":0"#), "{out}");
    let e = assign_json("{}", "[]", "").expect_err("invalid");
    assert_eq!(e.error_key, "assign.picchi_non_validi");
}

#[test]
fn a_shoulder_that_nothing_explains_is_minor_never_unexplained() {
    use ftir_core::peaks::result::Kind;
    let t = Thresholds::embedded().expect("thresholds");
    let mut sample = peaks_of(BANDS, 1);
    let mut shoulder = sample.peaks[0].clone();
    (shoulder.id, shoulder.kind, shoulder.position_cm1) = ("p99".into(), Kind::Shoulder, 2200.5);
    shoulder.prominence_rel = 0.5;
    sample.peaks.push(shoulder);
    let a = assign(
        &sample,
        &[Reference::new(id("hcl"), peaks_of(BANDS, 2))],
        &t,
    );
    let item = a.items.iter().find(|i| i.peak_id == "p99").expect("item");
    assert_eq!(item.state, State::Minor);
    assert_eq!(a.summary.n_unexplained, Some(0));
}
