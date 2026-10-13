//! Identity of the rows: the same substance under two names (two libraries) counts once for the margin and in the
//! candidate list when the rows share an InChIKey or a substance id; without identity the search is unchanged.
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

/// `(id, name, substance, inchikey, form, bands, seed)`.
type Row = (
    &'static str,
    &'static str,
    Option<&'static str>,
    Option<&'static str>,
    &'static str,
    &'static [(f64, f64, f64)],
    u64,
);

fn library(id: &str, rows: &[Row]) -> LibraryCache {
    let mut l = LibraryCache::new(id, "1.0");
    for (rid, name, substance, inchikey, form, bands, seed) in rows {
        let entry = LibEntry {
            id: (*rid).into(),
            substance: substance.map(Into::into),
            inchikey: inchikey.map(Into::into),
            display_name: (*name).into(),
            form: (*form).into(),
            classes: Vec::new(),
        };
        l.add(entry, &spectrum(bands, *seed)).expect("add");
    }
    l
}

const KEY: Option<&str> = Some("AAAAAAAAAAAAAA-BBBBBBBBBB-C");

fn run(libs: Vec<LibraryCache>) -> Value {
    let i = Index::new(libs);
    let t = Thresholds::embedded().expect("thresholds");
    let o = parse_options("{}", &t).expect("options");
    let out = search(&i, &spectrum(A, 7), &o, &t).expect("search");
    parse(&out.to_json(&i)).expect("result json")
}

fn two_libraries(
    left: (Option<&'static str>, Option<&'static str>),
    right: (Option<&'static str>, Option<&'static str>),
) -> Value {
    let other: Row = ("b1", "Other", Some("other"), None, "base", B, 3);
    run(vec![
        library(
            "one",
            &[("a1", "MDMA", left.0, left.1, "base", A, 1), other],
        ),
        library(
            "two",
            &[("a2", "92 MDMA_0", right.0, right.1, "base", A, 2)],
        ),
    ])
}

fn margin(res: &Value) -> f64 {
    res.get("margin").and_then(Value::as_f64).expect("margin")
}

fn candidates(res: &Value) -> &[Value] {
    res.get("candidates").and_then(Value::as_arr).unwrap()
}

fn level(res: &Value) -> &str {
    res.get("level_proposed").and_then(Value::as_str).unwrap()
}

#[test]
fn the_same_inchikey_under_two_names_is_one_substance() {
    let res = two_libraries((Some("mdma"), KEY), (Some("mdma-92"), KEY));
    assert!(margin(&res) > 0.3, "margin {}", margin(&res));
    assert_eq!(level(&res), "probable");
    let c = candidates(&res);
    assert_eq!(c.len(), 2, "MDMA once, the other substance once");
    let same = c[0].get("same_substance").and_then(Value::as_arr).unwrap();
    assert_eq!(same.len(), 1);
    assert_eq!(
        same[0].get("library").and_then(Value::as_str),
        Some(
            if c[0].get("library").and_then(Value::as_str) == Some("one") {
                "two"
            } else {
                "one"
            }
        )
    );
    assert!(c[1]
        .get("same_substance")
        .and_then(Value::as_arr)
        .unwrap()
        .is_empty());
}

#[test]
fn the_same_substance_id_alone_also_joins_the_rows() {
    let res = two_libraries((Some("mdma"), None), (Some("mdma"), None));
    assert!(margin(&res) > 0.3);
    assert_eq!(candidates(&res).len(), 2);
}

#[test]
fn a_shared_inchikey_joins_rows_even_when_the_substance_ids_differ_and_one_is_missing() {
    let res = two_libraries((Some("mdma"), KEY), (None, KEY));
    assert!(margin(&res) > 0.3);
    assert_eq!(candidates(&res).len(), 2);
}

#[test]
fn without_identity_the_names_decide_as_before() {
    let res = two_libraries((None, None), (None, None));
    assert!(margin(&res) < 0.05, "margin {}", margin(&res));
    assert_eq!(candidates(&res).len(), 3);
    assert!(candidates(&res).iter().all(|c| c
        .get("same_substance")
        .and_then(Value::as_arr)
        .unwrap()
        .is_empty()));
    let ids = two_libraries((Some("mdma"), None), (Some("mdma-92"), None));
    assert!(margin(&ids) < 0.05, "different ids, different substances");
    assert_eq!(candidates(&ids).len(), 3);
}
