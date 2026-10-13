//! Measurement quality: each injected defect is found, the clean spectrum has no warning, nothing ever blocks.
use ftir_core::measurement_quality::{check, check_json, Outcome, Report, Thresholds};
use ftir_core::passi::json;
use ftir_core::synthetic::{generate, Band, Params};

fn clean() -> Params {
    let mut p = Params::demo();
    p.step_cm1 = 2.0;
    p.noise = 0.0005;
    p
}

fn report(p: &Params) -> Report {
    check(&generate(p), &Thresholds::embedded().unwrap()).unwrap()
}

fn outcome(r: &Report, id: &str) -> Outcome {
    r.checks.iter().find(|c| c.id == id).unwrap().outcome
}

fn band(center_cm1: f64, half_width_cm1: f64, height: f64) -> Band {
    Band {
        center_cm1,
        half_width_cm1,
        height,
    }
}

#[test]
fn clean_spectrum_has_no_warning() {
    let r = report(&clean());
    assert_eq!(r.checks.len(), 3);
    assert!(
        r.checks.iter().all(|c| c.outcome == Outcome::NoSignal),
        "{r:?}"
    );
    assert!(!r.has_attention());
}

#[test]
fn residual_co2_is_found_with_its_position() {
    let mut p = clean();
    p.bands.push(band(2349.0, 8.0, 0.05));
    let r = report(&p);
    assert_eq!(outcome(&r, "co2"), Outcome::Attention);
    let c = &r.checks[0];
    assert!(
        c.measured.unwrap() > 0.02 && (c.at_cm1.unwrap() - 2349.0).abs() < 6.0,
        "{c:?}"
    );
}

#[test]
fn co2_just_below_the_limit_is_not_flagged() {
    let mut p = clean();
    p.bands.push(band(2349.0, 8.0, 0.012));
    assert_eq!(outcome(&report(&p), "co2"), Outcome::NoSignal);
}

#[test]
fn water_vapour_lines_are_found() {
    let mut p = clean();
    for k in 0..30 {
        p.bands.push(band(3702.0 + 6.5 * k as f64, 1.5, 0.04));
    }
    assert_eq!(outcome(&report(&p), "vapour"), Outcome::Attention);
}

#[test]
fn negative_band_is_found_and_strong_below_the_second_limit() {
    let mut p = clean();
    p.bands.push(band(3300.0, 20.0, -0.03));
    p.baseline_offset = 0.0;
    p.baseline_slope = 0.0;
    let weak = report(&p);
    assert_eq!(outcome(&weak, "negative"), Outcome::Attention);
    assert_eq!(weak.checks[2].severity, None);
    p.bands.push(band(3300.0, 20.0, -0.05));
    let strong = report(&p);
    assert_eq!(strong.checks[2].severity, Some("strong"));
}

#[test]
fn negative_dip_in_the_co2_region_is_not_a_negative_band() {
    let mut p = clean();
    p.bands.push(band(2349.0, 8.0, -0.2));
    assert_eq!(outcome(&report(&p), "negative"), Outcome::NoSignal);
}

#[test]
fn range_not_covered_is_not_evaluable_never_ok() {
    let mut p = clean();
    p.from_cm1 = 3000.0;
    let r = report(&p);
    assert_eq!(outcome(&r, "vapour"), Outcome::NotEvaluable);
    assert_eq!(r.checks[1].measured, None);
}

#[test]
fn warnings_never_block_and_the_text_is_never_a_pass_mark() {
    let mut p = clean();
    p.bands.push(band(2349.0, 8.0, 0.2));
    p.bands.push(band(3300.0, 20.0, -0.5));
    let text = report(&p).to_json();
    let v = json::parse(&text).unwrap();
    assert_eq!(v.get("blocks"), Some(&json::Value::Bool(false)));
    assert_eq!(
        v.get("summary_key").and_then(json::Value::as_str),
        Some("quality.summary.attention")
    );
    let clean_text = report(&clean()).to_json();
    assert!(clean_text.contains("quality.summary.no_signal"));
    for t in [&text, &clean_text] {
        assert!(
            !t.contains("\"ok\"") && !t.contains("pass") && !t.contains("safe"),
            "{t}"
        );
    }
    assert!(text.contains("quality.co2.action") && text.contains("quality.negative.action"));
}

#[test]
fn transmittance_is_an_error_with_a_key() {
    let j = r#"{"y_unit":"transmittance","wavenumber_cm1":[1,2,3,4,5],"y":[1,1,1,1,1]}"#;
    assert_eq!(
        check_json(j, "").unwrap_err().error_key,
        "quality.needs_absorbance"
    );
}
