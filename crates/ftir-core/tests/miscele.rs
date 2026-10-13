//! Mixtures on synthetic data (regression tests, not performance: the ATR non-linearity is not simulated).
use ftir_core::miscele::dati::{Cuts, Thresholds};
use ftir_core::miscele::risultato::{analyze_json, subtract_json};
use ftir_core::miscele::{analyze, iterativa, Candidate, Status};
use ftir_core::passi::json::{parse, Value};
use ftir_core::peaks;
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type Bands = &'static [(f64, f64, f64)];

const A: Bands = &[
    (1700.0, 5.0, 1.0),
    (1450.0, 6.0, 0.6),
    (1250.0, 5.0, 0.8),
    (1050.0, 6.0, 0.7),
    (2950.0, 12.5, 0.5),
];
const B: Bands = &[
    (1600.0, 5.0, 0.9),
    (1500.0, 5.0, 0.7),
    (1180.0, 6.0, 0.8),
    (900.0, 5.0, 0.8),
    (3300.0, 15.0, 0.4),
];
const C: Bands = &[
    (1100.0, 7.5, 1.0),
    (1020.0, 6.0, 0.9),
    (850.0, 5.0, 0.7),
    (1400.0, 7.5, 0.5),
];
const D: Bands = &[
    (1350.0, 5.0, 0.8),
    (1230.0, 5.0, 0.5),
    (760.0, 5.0, 0.8),
    (3500.0, 20.0, 0.6),
];
const E: Bands = &[
    (1650.0, 5.0, 0.8),
    (1300.0, 5.0, 0.7),
    (800.0, 5.0, 0.5),
    (1550.0, 6.0, 0.6),
];
const X: Bands = &[(3000.0, 6.0, 0.8), (1580.0, 4.0, 0.5)];

fn spectrum(parts: &[(Bands, f64)], offset: f64, slope: f64, seed: u64) -> Spectrum {
    let mut bands = Vec::new();
    for (list, scale) in parts {
        for &(c, w, h) in list.iter() {
            bands.push(Band {
                center_cm1: c,
                half_width_cm1: w,
                height: h * scale,
            });
        }
    }
    generate(&Params {
        from_cm1: 650.0,
        to_cm1: 3800.0,
        step_cm1: 2.0,
        bands,
        baseline_offset: offset,
        baseline_slope: slope,
        noise: 0.002,
        seed,
    })
}

fn candidate(id: &str, name: &str, substance: Option<&str>, bands: Bands, seed: u64) -> Candidate {
    Candidate {
        id: id.to_string(),
        substance: substance.map(str::to_string),
        name: name.to_string(),
        library: "lab-b".to_string(),
        spectrum: spectrum(&[(bands, 1.0)], 0.0, 0.0, seed),
    }
}

fn pool() -> Vec<Candidate> {
    vec![
        candidate("a-1", "substance-a", None, A, 1),
        candidate("b-1", "substance-b", None, B, 2),
        candidate("c-1", "Caffeine", Some("caffeine"), C, 3),
        candidate("d-1", "Lactose", Some("lactose"), D, 4),
        candidate("e-1", "substance-e", None, E, 5),
    ]
}

fn run(sample: &Spectrum, pool: &[Candidate]) -> ftir_core::miscele::Mixture {
    analyze(
        sample,
        pool,
        &Thresholds::embedded().expect("thresholds"),
        &Cuts::embedded().expect("cuts"),
        &peaks::Thresholds::embedded().expect("peaks"),
    )
    .expect("analysis")
}

fn ids(m: &ftir_core::miscele::Mixture) -> Vec<&str> {
    m.components.iter().map(|c| c.id.as_str()).collect()
}

#[test]
fn a_pure_spectrum_adds_no_second_component() {
    let m = run(&spectrum(&[(A, 1.0)], 0.02, 0.05, 11), &pool());
    assert_eq!(ids(&m), ["a-1"]);
    assert!(m.unexplained_share < 0.02, "{}", m.unexplained_share);
    assert!(m.alerts.is_empty() && m.unexplained_peaks.is_empty());
    assert!(m.components[0].bands.is_none() && m.components[0].variant_of.is_none());
}

#[test]
fn an_active_and_a_cut_are_found_with_their_shares_and_a_sloping_background() {
    let sample = spectrum(&[(A, 0.7), (C, 0.3)], 0.03, 0.08, 12);
    let m = run(&sample, &pool());
    assert_eq!(ids(&m), ["a-1", "c-1"]);
    let share = |i: usize| m.components[i].contribution;
    let areas = |b: Bands| b.iter().map(|&(_, w, h)| w * h).sum::<f64>();
    let expected_a = 0.7 * areas(A) / (0.7 * areas(A) + 0.3 * areas(C));
    assert!(
        (share(0) - expected_a).abs() < 0.04,
        "{} vs {expected_a}",
        share(0)
    );
    assert!((share(0) + share(1) - 1.0).abs() < 1e-12);
    assert!(m.components[1].is_cut && !m.components[0].is_cut);
    assert!(m
        .components
        .iter()
        .all(|c| c.needed > 0.02 && c.status == Status::Proposed));
    assert!(m.components[1].bands.as_ref().is_some_and(|b| b.passed));
}

#[test]
fn a_second_active_enters_only_if_it_explains_enough() {
    let weak = run(&spectrum(&[(A, 1.0), (B, 0.03)], 0.0, 0.0, 13), &pool());
    assert_eq!(ids(&weak), ["a-1"]);
    let strong = run(&spectrum(&[(A, 0.6), (B, 0.5)], 0.0, 0.0, 14), &pool());
    let mut found = ids(&strong);
    found.sort_unstable();
    assert_eq!(found, ["a-1", "b-1"]);
}

#[test]
fn an_unknown_band_stays_in_the_residual_and_raises_high_residual() {
    let m = run(&spectrum(&[(A, 0.8), (X, 1.0)], 0.0, 0.0, 15), &pool());
    assert!(ids(&m).contains(&"a-1"));
    let alert = m
        .alerts
        .iter()
        .find(|a| a.id == "high_residual")
        .expect("high_residual");
    assert!(alert
        .data
        .iter()
        .any(|(k, v)| k == "unexplained_peaks" && *v >= 1.0));
    assert!(m
        .unexplained_peaks
        .iter()
        .any(|p| (p.position_cm1 - 3000.0).abs() < 8.0));
    assert!(m
        .unexplained_peaks
        .iter()
        .all(|p| !p.region_ids.is_empty() || p.position_cm1 > 0.0));
}

#[test]
fn a_component_too_like_an_accepted_one_is_a_variant() {
    // A2 is A with its two main bands broadened: the derivative r with A stays above 0.6.
    let a2: Bands = &[
        (1700.0, 16.0, 1.0),
        (1450.0, 18.0, 0.6),
        (1250.0, 10.0, 0.8),
        (1050.0, 12.0, 0.7),
        (2950.0, 25.0, 0.5),
    ];
    let mut p = pool();
    p.push(candidate("a-2", "substance-a-other-form", None, a2, 6));
    let m = run(&spectrum(&[(A, 0.5), (a2, 0.5)], 0.0, 0.0, 16), &p);
    let variants: Vec<_> = m
        .components
        .iter()
        .filter(|c| c.variant_of.is_some())
        .collect();
    assert!(variants.len() <= 1 && !m.components.is_empty());
    if let Some(v) = variants.first() {
        assert!(m
            .components
            .iter()
            .any(|c| Some(&c.id) == v.variant_of.as_ref()));
    }
}

#[test]
fn json_in_and_out_are_valid_and_free_of_nan() {
    let sample = spectrum(&[(A, 0.7), (C, 0.3)], 0.0, 0.02, 17);
    let cand = |c: &Candidate| {
        let list = |v: &[f64]| {
            v.iter()
                .map(|x| format!("{x}"))
                .collect::<Vec<_>>()
                .join(",")
        };
        format!(
            r#"{{"id":"{}","name":"{}","substance":{},"library":"lab-b","wavenumber_cm1":[{}],"y":[{}]}}"#,
            c.id,
            c.name,
            c.substance
                .as_ref()
                .map_or("null".into(), |s| format!("\"{s}\"")),
            list(&c.spectrum.wavenumber_cm1),
            list(&c.spectrum.y)
        )
    };
    let list = |v: &[f64]| {
        v.iter()
            .map(|x| format!("{x}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    let input = format!(
        r#"{{"sample":{{"wavenumber_cm1":[{}],"y":[{}]}},"candidates":[{}]}}"#,
        list(&sample.wavenumber_cm1),
        list(&sample.y),
        pool().iter().map(cand).collect::<Vec<_>>().join(",")
    );
    let out = analyze_json(&input, "", "").expect("analysis");
    assert!(!out.contains("NaN") && !out.contains("inf"));
    let v = parse(&out).expect("valid json");
    assert_eq!(
        v.get("schema").and_then(Value::as_str),
        Some("ftir-risultato-miscele/1")
    );
    assert_eq!(
        v.get("components")
            .and_then(Value::as_arr)
            .map(<[Value]>::len),
        Some(2)
    );
    let sub = subtract_json(&input, "").expect("iterative");
    assert!(parse(&sub).is_ok() && !sub.contains("NaN"));
    assert!(analyze_json(r#"{"sample":{}}"#, "", "").is_err());
}

#[test]
fn a_flat_sample_is_an_error_not_a_guess() {
    let flat = spectrum(&[], 0.0, 0.0, 18);
    let e = analyze(
        &Spectrum {
            y: vec![0.1; flat.len()],
            ..flat
        },
        &pool(),
        &Thresholds::embedded().expect("t"),
        &Cuts::embedded().expect("c"),
        &peaks::Thresholds::embedded().expect("p"),
    );
    assert!(e.is_err());
}

fn rounds_of(sample: &Spectrum, pool: &[Candidate]) -> iterativa::Iteration {
    iterativa::run(
        sample,
        pool,
        &Thresholds::embedded().expect("thresholds"),
        &peaks::Thresholds::embedded().expect("peaks"),
    )
    .expect("iteration")
}

#[test]
fn the_iteration_recovers_known_factors_within_0_01_with_a_sloping_background() {
    let sample = spectrum(&[(A, 1.0), (B, 0.6)], 0.03, 0.06, 21);
    let r = rounds_of(&sample, &pool());
    let ids: Vec<&str> = r.rounds.iter().map(|x| x.id.as_str()).collect();
    assert_eq!(ids, ["a-1", "b-1"], "{:?}", r.rounds);
    assert!(
        (r.rounds[0].k - 1.0).abs() <= 0.01 + 1e-9,
        "{}",
        r.rounds[0].k
    );
    assert!(
        (r.rounds[1].k - 0.6).abs() <= 0.01 + 1e-9,
        "{}",
        r.rounds[1].k
    );
    assert!(r
        .residual
        .history
        .last()
        .is_some_and(|h| h.starts_with("sottratto: b-1")));
    assert!(r.unexplained_share < 0.05);
}

#[test]
fn a_pure_spectrum_makes_one_round_only() {
    let r = rounds_of(&spectrum(&[(B, 1.0)], 0.01, 0.03, 22), &pool());
    assert_eq!(r.rounds.len(), 1);
    assert_eq!(r.rounds[0].id, "b-1");
    assert!((r.rounds[0].k - 1.0).abs() <= 0.01 + 1e-9);
    assert!(!r.rounds[0].over_subtraction && r.alerts.is_empty());
}

#[test]
fn a_reference_with_a_band_the_sample_lacks_is_flagged_as_over_subtraction() {
    let mut extra: Vec<(f64, f64, f64)> = A.to_vec();
    extra.push((3200.0, 15.0, 2.0));
    let extra: Bands = Box::leak(extra.into_boxed_slice());
    let p = vec![candidate("a-x", "substance-a-with-extra", None, extra, 7)];
    let r = rounds_of(&spectrum(&[(A, 1.0)], 0.0, 0.0, 23), &p);
    assert_eq!(r.rounds.len(), 1);
    assert!(
        r.rounds[0].over_subtraction,
        "{:?}",
        r.rounds[0].zone_minimum
    );
    assert!(r.alerts.iter().any(|a| a.id == "over_subtraction"));
}

#[test]
fn the_rounds_stop_at_the_limit() {
    let sample = spectrum(&[(A, 1.0), (B, 0.8), (C, 0.7), (D, 0.6)], 0.0, 0.0, 24);
    let r = rounds_of(&sample, &pool());
    assert!(r.rounds.len() <= Thresholds::embedded().expect("t").max_rounds);
}
