//! The gate of a mixture proposal on synthetic data: an unknown makes none, two components make one, a minor component
//! is named and marked, a component that explains no peak is a reason to reject.
use ftir_core::miscele::dati::{Cuts, Thresholds};
use ftir_core::miscele::risultato::analyze_json;
use ftir_core::miscele::{analyze, Candidate, Mixture, Verdict};
use ftir_core::passi::json::{parse, Value};
use ftir_core::peaks;
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type Bands = &'static [(f64, f64, f64)];

const ACTIVE: Bands = &[
    (1700.0, 5.0, 1.0),
    (1450.0, 6.0, 0.6),
    (1250.0, 5.0, 0.8),
    (1050.0, 6.0, 0.7),
    (2950.0, 12.5, 0.5),
];
const CAFFEINE: Bands = &[
    (1700.0, 5.0, 0.9),
    (1655.0, 5.0, 1.0),
    (1550.0, 5.0, 0.5),
    (1240.0, 6.0, 0.6),
    (745.0, 5.0, 0.6),
];
const PARACETAMOL: Bands = &[
    (3325.0, 15.0, 0.6),
    (1610.0, 5.0, 0.7),
    (1505.0, 5.0, 1.0),
    (1225.0, 5.0, 0.6),
    (835.0, 5.0, 0.5),
];
const LACTOSE: Bands = &[
    (3350.0, 40.0, 0.4),
    (1160.0, 7.5, 0.7),
    (1070.0, 7.5, 0.8),
    (1030.0, 6.0, 1.0),
    (900.0, 5.0, 0.3),
];
const LEVAMISOLE: Bands = &[
    (1600.0, 5.0, 0.9),
    (1480.0, 5.0, 0.7),
    (1300.0, 5.0, 0.6),
    (700.0, 5.0, 1.0),
];
const UNKNOWN: Bands = &[
    (1735.0, 5.0, 1.0),
    (1380.0, 6.0, 0.8),
    (1120.0, 5.0, 0.6),
    (960.0, 5.0, 0.7),
    (790.0, 5.0, 0.5),
    (3060.0, 8.0, 0.4),
];
/// A broad hump with no sharp band (a filler seen as a raised background).
const HUMP: Bands = &[(2000.0, 450.0, 0.25)];

fn spectrum(parts: &[(Bands, f64)], seed: u64) -> Spectrum {
    let bands = parts
        .iter()
        .flat_map(|(list, scale)| {
            list.iter().map(move |&(c, w, h)| Band {
                center_cm1: c,
                half_width_cm1: w,
                height: h * scale,
            })
        })
        .collect();
    generate(&Params {
        from_cm1: 650.0,
        to_cm1: 3800.0,
        step_cm1: 2.0,
        bands,
        baseline_offset: 0.02,
        baseline_slope: 0.03,
        noise: 0.002,
        seed,
    })
}

fn candidate(id: &str, substance: &str, bands: Bands, seed: u64) -> Candidate {
    Candidate {
        id: id.to_string(),
        substance: Some(substance.to_string()),
        name: substance.to_string(),
        library: "lab-s".to_string(),
        spectrum: spectrum(&[(bands, 1.0)], seed),
    }
}

fn pool() -> Vec<Candidate> {
    vec![
        candidate("active", "example-a", ACTIVE, 1),
        candidate("caffeine", "caffeine", CAFFEINE, 2),
        candidate("paracetamol", "acetaminophen", PARACETAMOL, 3),
        candidate("lactose", "lactose", LACTOSE, 4),
        candidate("levamisole", "levamisole", LEVAMISOLE, 5),
    ]
}

fn run(sample: &Spectrum, pool: &[Candidate]) -> Mixture {
    analyze(
        sample,
        pool,
        &Thresholds::embedded().expect("thresholds"),
        &Cuts::embedded().expect("cuts"),
        &peaks::Thresholds::embedded().expect("peaks"),
    )
    .expect("analysis")
}

fn sorted_ids(m: &Mixture) -> Vec<&str> {
    let mut v: Vec<&str> = m.components.iter().map(|c| c.id.as_str()).collect();
    v.sort_unstable();
    v
}

#[test]
fn an_unknown_sample_makes_no_proposal() {
    for seed in [31, 32, 33] {
        let m = run(&spectrum(&[(UNKNOWN, 1.0)], seed), &pool());
        assert_ne!(m.proposal.verdict, Verdict::Proposed, "{:?}", m.proposal);
        assert!(m.proposal.reason.is_some());
    }
}

#[test]
fn an_unknown_two_components_cannot_explain_is_rejected_for_its_residual() {
    // D02: the fit names two components and leaves most of the spectrum unexplained.
    let m = run(
        &spectrum(&[(UNKNOWN, 1.0), (ACTIVE, 0.5), (CAFFEINE, 0.4)], 34),
        &pool(),
    );
    assert_eq!(sorted_ids(&m), ["active", "caffeine"]);
    assert_eq!(m.proposal.verdict, Verdict::Rejected, "{:?}", m.proposal);
    assert_eq!(m.proposal.reason, Some("high_residual"));
    assert!(m.unexplained_share > 0.3, "{}", m.unexplained_share);
}

#[test]
fn sixty_forty_and_eighty_twenty_give_both_components() {
    let m = run(&spectrum(&[(ACTIVE, 0.6), (CAFFEINE, 0.4)], 35), &pool());
    assert_eq!(m.proposal.verdict, Verdict::Proposed, "{:?}", m.proposal);
    assert_eq!(sorted_ids(&m), ["active", "caffeine"]);
    let m = run(&spectrum(&[(LACTOSE, 0.8), (LEVAMISOLE, 0.2)], 36), &pool());
    assert_eq!(m.proposal.verdict, Verdict::Proposed, "{:?}", m.proposal);
    assert_eq!(sorted_ids(&m), ["lactose", "levamisole"]);
    assert!(m.components.iter().all(|c| c.explained_peaks >= 1));
}

#[test]
fn ninety_ten_names_the_minor_component_or_says_why_not() {
    let m = run(
        &spectrum(&[(CAFFEINE, 0.9), (PARACETAMOL, 0.1)], 37),
        &pool(),
    );
    match m.proposal.verdict {
        Verdict::Proposed => {
            let minor = m
                .components
                .iter()
                .find(|c| c.id == "paracetamol")
                .expect("paracetamol");
            assert!(minor.minor && minor.explained_peaks >= 1, "{minor:?}");
            assert!(m.components.iter().any(|c| c.id == "caffeine" && !c.minor));
            assert!(m.unexplained_peaks.is_empty(), "{:?}", m.unexplained_peaks);
        }
        _ => assert!(m.proposal.reason.is_some(), "{:?}", m.proposal),
    }
}

#[test]
fn a_pure_sample_has_no_minor_component() {
    for (bands, seed) in [(ACTIVE, 38), (CAFFEINE, 39), (LACTOSE, 40)] {
        let m = run(&spectrum(&[(bands, 1.0)], seed), &pool());
        assert_eq!(m.components.len(), 1, "{:?}", sorted_ids(&m));
        assert_eq!(m.proposal.verdict, Verdict::None);
        assert_eq!(m.proposal.reason, Some("single_component"));
    }
}

#[test]
fn a_component_that_explains_no_peak_rejects_the_proposal() {
    let mut p = pool();
    p.push(candidate("hump", "starch", HUMP, 6));
    let m = run(&spectrum(&[(ACTIVE, 0.5), (HUMP, 1.0)], 41), &p);
    assert!(
        m.components.iter().any(|c| c.id == "hump"),
        "{:?}",
        sorted_ids(&m)
    );
    assert_eq!(m.proposal.verdict, Verdict::Rejected, "{:?}", m.proposal);
    assert_eq!(m.proposal.reason, Some("component_without_peaks"));
    assert_eq!(m.proposal.component.as_deref(), Some("hump"));
}

#[test]
fn the_json_carries_the_proposal_and_the_peaks_of_each_component() {
    let sample = spectrum(&[(ACTIVE, 0.6), (CAFFEINE, 0.4)], 42);
    let list = |v: &[f64]| {
        v.iter()
            .map(|x| format!("{x}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    let items: Vec<String> = pool()
        .iter()
        .map(|c| {
            format!(
                r#"{{"id":"{}","name":"{}","library":"lab-s","wavenumber_cm1":[{}],"y":[{}]}}"#,
                c.id,
                c.name,
                list(&c.spectrum.wavenumber_cm1),
                list(&c.spectrum.y)
            )
        })
        .collect();
    let input = format!(
        r#"{{"sample":{{"wavenumber_cm1":[{}],"y":[{}]}},"candidates":[{}]}}"#,
        list(&sample.wavenumber_cm1),
        list(&sample.y),
        items.join(",")
    );
    let v = parse(&analyze_json(&input, "", "").expect("analysis")).expect("json");
    let proposal = v.get("proposal").expect("proposal");
    assert_eq!(
        proposal.get("status").and_then(Value::as_str),
        Some("proposed")
    );
    assert!(matches!(proposal.get("reason"), Some(Value::Null)));
    let parts = v.get("components").and_then(Value::as_arr).expect("parts");
    assert!(parts.iter().all(|c| {
        c.get("explained_peaks")
            .and_then(Value::as_f64)
            .is_some_and(|n| n >= 1.0)
            && matches!(c.get("minor"), Some(Value::Bool(false)))
    }));
}
