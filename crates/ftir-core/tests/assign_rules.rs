//! Interpretations, assignments of the bands of a substance and suspects (package ASSIGNMENT, PR 2) on synthetic
//! spectra and small rule sets written in the test.
use ftir_core::assign::context::{Context, Cut, Origin, SubstanceBand, SubstanceBands};
use ftir_core::assign::interpret::at_position_json;
use ftir_core::assign::result::{Assignment, ReferenceId, State};
use ftir_core::assign::rules::RuleSet;
use ftir_core::assign::{assign_json, assign_with, PeakSet, Reference};
use ftir_core::peaks::result::Shape;
use ftir_core::peaks::{detect, Thresholds};
use ftir_core::synthetic::{generate, Band, Params};

type B = (f64, f64, f64);

fn peaks_of(bands: &[B], seed: u64) -> PeakSet {
    let s = generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
        step_cm1: 2.0,
        bands: (bands.iter())
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
    });
    let t = Thresholds::embedded().expect("thresholds");
    PeakSet::from(&detect(&s, &t).expect("detect"))
}

/// A rule of `bands/1`; `extra` is raw JSON for conditions, scope and classes.
fn rule(id: &str, min: i32, max: i32, extra: &str) -> String {
    format!(
        r#"{{"id":"{id}","version":1,"range_cm1":{{"min":{min},"max":{max}}},"group":"g_{id}","mode":"stretch","intensity":"strong","shape":"sharp","sources":["s"],"status":"draft"{extra}}}"#
    )
}

fn rules(list: &[String]) -> RuleSet {
    let text = format!(
        r#"{{"schema":"bands/1","version":"test.1","rules":[{}]}}"#,
        list.join(",")
    );
    RuleSet::parse(&text).expect("rules")
}

fn ctx(list: &[String]) -> Context {
    Context {
        rules: Some(rules(list)),
        ..Context::empty()
    }
}

fn id(substance: &str) -> ReferenceId {
    ReferenceId {
        spectrum_id: None,
        substance_id: substance.into(),
        form: "hcl".into(),
        library: None,
        version: None,
    }
}

const SAMPLE: &[B] = &[(1700.0, 8.0, 1.0), (1450.0, 10.0, 0.5), (1000.0, 12.0, 0.7)];

fn run(sample: &[B], refs: &[Reference], c: &Context) -> Assignment {
    let t = Thresholds::embedded().expect("thresholds");
    assign_with(&peaks_of(sample, 1), refs, c, &t)
}

fn candidate(bands: &[B]) -> Vec<Reference> {
    vec![Reference::new(id("sub"), peaks_of(bands, 2))]
}

fn groups_at(a: &Assignment, n: usize) -> Vec<String> {
    a.items[n]
        .interpretations
        .iter()
        .map(|i| i.group.clone())
        .collect()
}

#[test]
fn a_rule_with_a_missing_condition_is_discarded() {
    let list = [
        rule(
            "ester",
            1690,
            1730,
            r#","conditions":{"requires_any":["co_c"]}"#,
        ),
        rule("co_c", 1240, 1280, ""),
    ];
    let a = run(SAMPLE, &[], &ctx(&list));
    let at_1700 = a
        .items
        .iter()
        .position(|i| i.peak_id == "p1")
        .expect("peak");
    assert!(groups_at(&a, at_1700).is_empty(), "{a:?}");
    let mut with_band = SAMPLE.to_vec();
    with_band.push((1260.0, 6.0, 0.4));
    let a = run(&with_band, &[], &ctx(&list));
    let hits: Vec<_> = a
        .items
        .iter()
        .flat_map(|i| i.interpretations.iter())
        .collect();
    assert!(
        hits.iter().any(|h| h.rule_id.as_deref() == Some("ester")),
        "{a:?}"
    );
    assert_eq!(a.bands_version.as_deref(), Some("test.1"));
}

#[test]
fn four_compatible_rules_make_a_crowded_region_with_three_listed() {
    let list: Vec<String> = ["a", "b", "c", "d"]
        .iter()
        .enumerate()
        .map(|(k, n)| rule(n, 1690 - 2 * k as i32, 1730 + 4 * k as i32, ""))
        .collect();
    let a = run(SAMPLE, &[], &ctx(&list));
    let item = a
        .items
        .iter()
        .find(|i| !i.interpretations.is_empty())
        .expect("item");
    assert_eq!(item.interpretations.len(), 3);
    assert!(item.crowded);
    let ranks: Vec<_> = item.interpretations.iter().map(|i| i.rank).collect();
    assert_eq!(ranks, [1, 2, 3]);
    assert_eq!(
        item.interpretations[0].rule_id.as_deref(),
        Some("a"),
        "narrowest first"
    );
}

#[test]
fn a_rule_diagnostic_for_a_class_of_the_candidate_comes_first() {
    let diag = r#","diagnostic_for":[{"class":"cls","strength":"supporting"}]"#;
    let list = [
        rule("narrow", 1695, 1705, ""),
        rule("wide", 1650, 1750, diag),
    ];
    let mut c = ctx(&list);
    c.candidate_classes = vec!["cls".into()];
    let a = run(SAMPLE, &[], &c);
    let item = a
        .items
        .iter()
        .find(|i| i.interpretations.len() == 2)
        .expect("item");
    assert_eq!(item.interpretations[0].rule_id.as_deref(), Some("wide"));
    let a = run(SAMPLE, &[], &ctx(&list));
    let item = a
        .items
        .iter()
        .find(|i| i.interpretations.len() == 2)
        .expect("item");
    assert_eq!(item.interpretations[0].rule_id.as_deref(), Some("narrow"));
}

#[test]
fn below_the_fingerprint_limit_only_diagnostic_rules_show_without_a_candidate() {
    let diag = r#","diagnostic_for":[{"class":"cls","strength":"strong"}]"#;
    let list = [rule("plain", 980, 1020, ""), rule("diag", 980, 1020, diag)];
    let a = run(SAMPLE, &[], &ctx(&list));
    let hits: Vec<_> = a
        .items
        .iter()
        .flat_map(|i| i.interpretations.iter())
        .collect();
    assert_eq!(hits.len(), 1, "{a:?}");
    assert_eq!(hits[0].rule_id.as_deref(), Some("diag"));
    let a = run(SAMPLE, &candidate(SAMPLE), &ctx(&list));
    let hits: usize = a.items.iter().map(|i| i.interpretations.len()).sum();
    assert_eq!(hits, 2, "{a:?}");
}

#[test]
fn a_candidate_only_rule_needs_a_group_the_candidate_already_has_in_that_band() {
    let list = [rule("ring", 1440, 1460, r#","scope":"candidate_only""#)];
    let a = run(SAMPLE, &candidate(SAMPLE), &ctx(&list));
    assert!(
        a.items.iter().all(|i| i.interpretations.is_empty()),
        "{a:?}"
    );
    let mut c = ctx(&list);
    c.substance_bands = vec![SubstanceBands {
        substance_id: "sub".into(),
        form: "hcl".into(),
        bands: vec![band(1450.0, "g_ring", Origin::Literature)],
    }];
    let a = run(SAMPLE, &candidate(SAMPLE), &c);
    let hits: Vec<_> = a
        .items
        .iter()
        .flat_map(|i| i.interpretations.iter())
        .collect();
    assert_eq!(hits.len(), 1, "{a:?}");
}

fn band(at: f64, group: &str, origin: Origin) -> SubstanceBand {
    SubstanceBand {
        position_cm1: at,
        tolerance_cm1: 6.0,
        group: group.into(),
        mode: "stretch".into(),
        group_instance: Some("methyl ester".into()),
        mode_character: Some("mostly C=O".into()),
        origin,
        status: "draft".into(),
    }
}

#[test]
fn the_assignment_of_a_band_goes_with_the_explanation_and_dft_never_explains() {
    let mut c = Context::empty();
    c.substance_bands = vec![SubstanceBands {
        substance_id: "sub".into(),
        form: "hcl".into(),
        bands: vec![
            band(1700.0, "ester", Origin::Dft),
            band(1100.0, "ether", Origin::Dft),
        ],
    }];
    let reference: Vec<B> = SAMPLE.to_vec();
    let mut sample = SAMPLE.to_vec();
    sample.push((1100.0, 6.0, 0.4));
    let a = run(&sample, &candidate(&reference), &c);
    let by = (a.items.iter())
        .filter_map(|i| i.explained_by.as_ref())
        .find(|b| (b.ref_peak_cm1 - 1700.0).abs() < 3.0)
        .expect("explained at 1700");
    let info = by.band.as_ref().expect("band info");
    assert_eq!((info.group.as_str(), info.origin), ("ester", "dft"));
    assert_eq!(info.group_instance.as_deref(), Some("methyl ester"));
    let extra = a
        .items
        .iter()
        .find(|i| i.state == State::Unexplained)
        .expect("unexplained");
    assert_eq!(extra.interpretations.len(), 1, "{a:?}");
    assert_eq!(extra.interpretations[0].origin, Some("dft"));
    assert_eq!(extra.interpretations[0].rule_id, None);
}

#[test]
fn suspects_are_cuts_with_a_diagnostic_band_at_an_unexplained_peak_and_never_more_than_three() {
    let cut = |n: &str, at: f64| Cut {
        id: n.into(),
        bands: vec![(at, None)],
    };
    let mut c = Context::empty();
    c.cuts = vec![
        cut("c1", 1101.0),
        cut("c2", 1099.0),
        cut("c3", 1100.0),
        cut("c4", 1102.0),
        cut("far", 900.0),
    ];
    let mut sample = SAMPLE.to_vec();
    sample.push((1100.0, 6.0, 0.4));
    let a = run(&sample, &candidate(SAMPLE), &c);
    let extra = a
        .items
        .iter()
        .find(|i| i.state == State::Unexplained)
        .expect("unexplained");
    assert_eq!(extra.suspects, ["c1", "c2", "c3"]);
    assert!(a
        .items
        .iter()
        .filter(|i| i.state != State::Unexplained)
        .all(|i| i.suspects.is_empty()));
    let known = vec![Reference::new(id("c1"), peaks_of(SAMPLE, 2))];
    let a = run(&sample, &known, &c);
    let extra = a
        .items
        .iter()
        .find(|i| i.state == State::Unexplained)
        .expect("unexplained");
    assert!(!extra.suspects.contains(&"c1".to_string()));
}

#[test]
fn the_rules_for_a_position_are_listed_narrowest_first() {
    let text = format!(
        r#"{{"schema":"bands/1","version":"t","rules":[{},{}]}}"#,
        rule("wide", 1650, 1750, ""),
        rule("narrow", 1695, 1705, "")
    );
    let out = at_position_json(1700.0, 0.0, &text).expect("json");
    assert!(
        out.find("narrow").expect("narrow") < out.find("wide").expect("wide"),
        "{out}"
    );
    assert_eq!(at_position_json(3000.0, 0.0, &text).expect("json"), "[]");
}

#[test]
fn json_in_json_out_reads_the_embedded_rules_and_a_context() {
    let t = Thresholds::embedded().expect("thresholds");
    let list = detect(
        &generate(&Params {
            from_cm1: 4000.0,
            to_cm1: 400.0,
            step_cm1: 2.0,
            bands: vec![Band {
                center_cm1: 1700.0,
                half_width_cm1: 8.0,
                height: 1.0,
            }],
            baseline_offset: 0.02,
            baseline_slope: 0.04,
            noise: 0.0005,
            seed: 1,
        }),
        &t,
    )
    .expect("detect");
    let sample = list.to_json();
    let out = assign_json(&sample, "[]", "", "").expect("assign");
    assert!(out.contains(r#""bands_version":"2026-10.1""#), "{out}");
    let bad =
        assign_json(&sample, "[]", r#"{"cuts":{"cuts":[{"id":1}]}}"#, "").expect_err("invalid");
    assert_eq!(bad.error_key, "assign.contesto_non_valido");
}

/// A rule of the given shape and any intensity at 1700 (above the fingerprint limit, so no candidate is needed).
fn shaped(shape: &str) -> String {
    rule("r", 1650, 1750, "").replace(
        r#""intensity":"strong","shape":"sharp""#,
        &format!(r#""intensity":"variable","shape":"{shape}""#),
    )
}

/// Shape of the peak × shape of the rule: a broad rule reads only broad and very broad peaks, a sharp rule only
/// narrow and medium ones, the others every peak. Lorentz FWHM at widths measured on the SWGDRUG reference spectra:
/// ring 8, 14; C=O 28; free NH₂ 53, 57 (medium); H-bonded N-H 76, N-H⁺ 108 (broad).
#[test]
fn the_shape_of_a_rule_reads_only_the_peaks_of_a_compatible_width() {
    let t = Thresholds::embedded().expect("thresholds");
    let [narrow, medium, broad] = t.shape_below_cm1;
    let read = |shape: &str, half: f64| {
        let c = ctx(&[shaped(shape)]);
        let a = run(&[(1700.0, half, 1.0)], &[], &c);
        let peaks = peaks_of(&[(1700.0, half, 1.0)], 1);
        assert_eq!(a.items.len(), 1, "one peak");
        (peaks.peaks[0].shape, !a.items[0].interpretations.is_empty())
    };
    for fwhm in [8.0, 14.0, 28.0, 53.0, 57.0, 76.0, 108.0] {
        let half = fwhm / 2.0;
        let (shape, _) = read("sharp", half);
        let shape = shape.expect("shape");
        let expect = if fwhm < narrow {
            Shape::Narrow
        } else if fwhm < medium {
            Shape::Medium
        } else if fwhm < broad {
            Shape::Broad
        } else {
            Shape::VeryBroad
        };
        assert!(shape == expect || fwhm == medium, "FWHM {fwhm}: {shape:?}");
        let is_broad = matches!(shape, Shape::Broad | Shape::VeryBroad);
        assert_eq!(read("sharp", half).1, !is_broad, "sharp rule, FWHM {fwhm}");
        assert_eq!(read("broad", half).1, is_broad, "broad rule, FWHM {fwhm}");
        assert_eq!(
            read("very_broad", half).1,
            is_broad,
            "very_broad rule, FWHM {fwhm}"
        );
        for any in ["medium", "doublet", "multiplet"] {
            assert!(read(any, half).1, "{any} rule, FWHM {fwhm}");
        }
    }
}

/// With the embedded rules, the free NH₂ stretch of an aromatic amine (FWHM 53 cm⁻¹, benzocaine-like, with a band in
/// the water bend window) is a medium peak and is not read as water; a broad O-H band at 3400 still is.
#[test]
fn a_free_nh2_stretch_is_not_read_as_water() {
    let c = Context {
        rules: Some(RuleSet::embedded().expect("rules")),
        ..Context::empty()
    };
    let water_at = |sample: &[B], at: f64| {
        let a = run(sample, &[], &c);
        let peaks = peaks_of(sample, 1);
        let n = (peaks.peaks.iter())
            .position(|p| (p.position_cm1 - at).abs() < 6.0)
            .expect("peak");
        let read = (a.items[n].interpretations.iter())
            .any(|i| i.rule_id.as_deref() == Some("h2o.stretch"));
        (peaks.peaks[n].shape, read)
    };
    let amine = [
        (3337.0, 26.5, 0.4),
        (3219.0, 15.0, 0.25),
        (1678.0, 8.0, 1.0),
        (1632.0, 8.5, 0.4),
        (1598.0, 5.0, 0.6),
    ];
    assert_eq!(water_at(&amine, 3337.0), (Some(Shape::Medium), false));
    let wet = [
        (3400.0, 120.0, 0.5),
        (1640.0, 40.0, 0.2),
        (1598.0, 5.0, 0.6),
    ];
    assert_eq!(water_at(&wet, 3400.0), (Some(Shape::VeryBroad), true));
}

#[test]
fn the_band_of_the_explaining_substance_is_read_before_the_generic_rules() {
    let list = [rule("ether", 1190, 1230, "")];
    let mut c = ctx(&list);
    c.substance_bands = vec![SubstanceBands {
        substance_id: "sub".into(),
        form: "hcl".into(),
        bands: vec![band(1210.0, "amine", Origin::Literature)],
    }];
    let sample: Vec<B> = vec![(1700.0, 8.0, 1.0), (1210.0, 8.0, 0.6)];
    let a = run(&sample, &candidate(&sample), &c);
    let item = (a.items.iter())
        .find(|i| {
            i.explained_by
                .as_ref()
                .is_some_and(|b| (b.ref_peak_cm1 - 1210.0).abs() < 3.0)
        })
        .expect("explained at 1210");
    let groups: Vec<_> = item
        .interpretations
        .iter()
        .map(|i| i.group.as_str())
        .collect();
    assert_eq!(groups, ["amine", "g_ether"], "{a:?}");
}
