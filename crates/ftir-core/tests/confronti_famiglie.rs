//! Flagged families: a shown candidate of a flagged class raises `family_flagged` with the class and the source, and
//! the level does not move because of it. Synthetic library; the classes are made up on the rows.
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

const A: &[(f64, f64, f64)] = &[
    (800.0, 10.0, 0.5),
    (1050.0, 12.0, 0.8),
    (1250.0, 9.0, 0.5),
    (1450.0, 14.0, 0.6),
    (1700.0, 12.0, 0.9),
    (2900.0, 20.0, 0.4),
];
const B: &[(f64, f64, f64)] = &[
    (700.0, 9.0, 0.6),
    (950.0, 11.0, 0.7),
    (1150.0, 10.0, 0.9),
    (1380.0, 13.0, 0.5),
    (1600.0, 15.0, 0.7),
    (3050.0, 25.0, 0.5),
];

fn spectrum(bands: &[(f64, f64, f64)], seed: u64) -> Spectrum {
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 600.0,
        step_cm1: 2.0,
        bands: bands
            .iter()
            .map(|b| Band {
                center_cm1: b.0,
                half_width_cm1: b.1,
                height: b.2,
            })
            .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.03,
        noise: 0.0005,
        seed,
    })
}

fn index(class_of_a: &[&str]) -> Index {
    let mut l = LibraryCache::new("lib", "1.0");
    for (id, bands, seed, classes) in [("a", A, 1, class_of_a), ("b", B, 2, &["sugar"][..])] {
        let entry = LibEntry {
            id: id.into(),
            substance: Some(id.into()),
            display_name: format!("Substance {id}"),
            form: "base".into(),
            classes: classes.iter().map(|c| c.to_string()).collect(),
        };
        l.add(entry, &spectrum(bands, seed)).expect("add");
    }
    Index::new(vec![l])
}

fn run(i: &Index) -> Value {
    let t = Thresholds::embedded().expect("thresholds");
    let o = parse_options("{}", &t).expect("options");
    let out = search(i, &spectrum(A, 7), &o, &t).expect("search");
    parse(&out.to_json(i)).expect("result json")
}

fn family(res: &Value) -> Vec<&Value> {
    res.get("alerts")
        .and_then(Value::as_arr)
        .unwrap()
        .iter()
        .filter(|a| a.get("id").and_then(Value::as_str) == Some("family_flagged"))
        .collect()
}

#[test]
fn a_shown_candidate_of_a_flagged_class_raises_the_alert_without_moving_the_level() {
    let plain = run(&index(&["sugar"]));
    let flagged = run(&index(&["nitazenes", "opioid"]));
    assert!(family(&plain).is_empty());
    let alerts = family(&flagged);
    assert_eq!(alerts.len(), 1);
    let d = alerts[0].get("data").unwrap();
    let s = |k: &str| d.get(k).and_then(Value::as_str).unwrap();
    assert_eq!((s("class"), s("source")), ("nitazenes", "unodc-ewa"));
    assert_eq!(s("display_name"), "Substance a");
    assert_eq!(d.get("rank").and_then(Value::as_f64), Some(1.0));
    let level = |r: &Value| {
        r.get("level_proposed")
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    assert_eq!(level(&plain), level(&flagged));
    assert_eq!(level(&flagged).as_deref(), Some("probable"));
}

#[test]
fn two_flagged_classes_give_two_alerts_and_an_unflagged_class_none() {
    assert_eq!(
        family(&run(&index(&["fentanyls", "benzodiazepines"]))).len(),
        2
    );
    assert!(family(&run(&index(&["amphetamines"]))).is_empty());
}
