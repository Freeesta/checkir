//! Library comparison on synthetic spectra: identity, invariance, ambiguity, several libraries, residuals, forms,
//! spectral twins, ranges, coverage. Every number here follows from the construction of the spectra.
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::{parse_options, parse_query};
use ftir_core::confronti::pearson::{score_derivative, score_spectrum};
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use ftir_core::synthetic::{generate, Band, Params};

type Bands<'a> = &'a [(f64, f64, f64)];

fn make(bands: Bands, seed: u64) -> Spectrum {
    let p = Params {
        from_cm1: 4000.0,
        to_cm1: 600.0,
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
        baseline_slope: 0.03,
        noise: 0.0005,
        seed,
    };
    generate(&p)
}

const A: Bands = &[
    (800.0, 10.0, 0.5),
    (1050.0, 12.0, 0.8),
    (1250.0, 9.0, 0.5),
    (1450.0, 14.0, 0.6),
    (1700.0, 12.0, 0.9),
    (2900.0, 20.0, 0.4),
];
const B: Bands = &[
    (700.0, 9.0, 0.6),
    (950.0, 11.0, 0.7),
    (1150.0, 10.0, 0.9),
    (1380.0, 13.0, 0.5),
    (1600.0, 15.0, 0.7),
    (3050.0, 25.0, 0.5),
];
const C: Bands = &[
    (870.0, 8.0, 0.4),
    (1010.0, 10.0, 0.6),
    (1300.0, 12.0, 0.8),
    (1520.0, 11.0, 0.5),
    (1750.0, 14.0, 0.6),
    (3300.0, 30.0, 0.7),
];
const D: Bands = &[
    (650.0, 10.0, 0.7),
    (1100.0, 14.0, 0.6),
    (1330.0, 9.0, 0.7),
    (1480.0, 12.0, 0.8),
    (1650.0, 13.0, 0.5),
    (2850.0, 18.0, 0.6),
];

fn entry(id: &str, substance: &str, form: &str) -> LibEntry {
    LibEntry {
        id: id.into(),
        substance: Some(substance.into()),
        inchikey: None,
        display_name: format!("Substance {substance}"),
        form: form.into(),
        classes: Vec::new(),
    }
}

fn library(id: &str, rows: &[(&str, &str, &str, Spectrum)]) -> LibraryCache {
    let mut l = LibraryCache::new(id, "1.0");
    for (rid, sub, form, s) in rows {
        l.add(entry(rid, sub, form), s).expect("add");
    }
    l
}

fn thresholds() -> Thresholds {
    Thresholds::embedded().expect("thresholds")
}

fn run(index: &Index, q: &Spectrum, options: &str) -> Value {
    let t = thresholds();
    let o = parse_options(options, &t).expect("options");
    let out = search(index, q, &o, &t).expect("search");
    parse(&out.to_json(index)).expect("result json")
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing {key}"))
}

fn num(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("missing number {key}"))
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_arr)
        .unwrap_or_else(|| panic!("missing list {key}"))
}

fn alert<'a>(res: &'a Value, id: &str) -> Option<&'a Value> {
    list(res, "alerts").iter().find(|a| text(a, "id") == id)
}

fn simple_index() -> Index {
    Index::new(vec![library(
        "lib",
        &[
            ("a", "A", "base", make(A, 1)),
            ("b", "B", "base", make(B, 2)),
            ("c", "C", "base", make(C, 3)),
        ],
    )])
}

#[test]
fn a_spectrum_matches_itself_and_scale_and_offset_do_not_matter() {
    let (a, mut scaled) = (make(A, 1), make(A, 1));
    scaled.y.iter_mut().for_each(|v| *v = 3.0 * *v + 0.2);
    assert!((score_derivative(&a, &scaled).unwrap() - 1.0).abs() < 1e-9);
    assert!((score_spectrum(&a, &scaled).unwrap() - 1.0).abs() < 1e-9);
    let res = run(&simple_index(), &scaled, "");
    let top = &list(&res, "candidates")[0];
    assert_eq!(text(top, "spectrum_id"), "a");
    assert!(num(top, "r_derivative") > 1.0 - 1e-6);
    assert_eq!(text(&res, "level_proposed"), "probable");
    assert_eq!(text(&res, "schema"), "ftir-risultato-confronto/1");
}

#[test]
fn the_result_records_chain_libraries_thresholds_and_ranges() {
    let res = run(&simple_index(), &make(A, 9), "");
    assert_eq!(
        text(res.get("chain").unwrap(), "derivative"),
        "confronto_v1"
    );
    assert_eq!(num(res.get("thresholds").unwrap(), "version"), 3.0);
    let libs = list(&res, "libraries");
    assert_eq!(
        (
            text(&libs[0], "id"),
            text(&libs[0], "version"),
            num(&libs[0], "spectra")
        ),
        ("lib", "1.0", 3.0)
    );
    assert_eq!(text(&res, "range_preset"), "full");
    assert_eq!(text(&res, "grouping"), "identity");
    assert_eq!(text(res.get("query").unwrap(), "role"), "sample");
    let words = ["confirmed", "sure", "pure", "clean"];
    assert!(!words
        .iter()
        .any(|w| text(&res, "level_proposed").contains(w)));
}

#[test]
fn near_identical_substances_raise_ambiguity() {
    let mut a2 = A.to_vec();
    a2[3].2 = 0.62; // one band 3 % higher
    let index = Index::new(vec![library(
        "lib",
        &[
            ("a", "A", "base", make(A, 1)),
            ("a2", "A2", "base", make(&a2, 4)),
            ("b", "B", "base", make(B, 2)),
        ],
    )]);
    let res = run(&index, &make(A, 5), "");
    assert!(num(&res, "margin") < 0.05, "margin {}", num(&res, "margin"));
    let amb = alert(&res, "ambiguity").expect("ambiguity alert");
    let reasons = list(amb.get("data").unwrap(), "reasons");
    assert!(reasons.iter().any(|r| r.as_str() == Some("margin")));
    assert_ne!(text(&res, "level_proposed"), "probable");
}

#[test]
fn an_unidentified_sample_raises_no_ambiguity() {
    let index = Index::new(vec![library(
        "lib",
        &[
            ("a", "A", "base", make(A, 1)),
            ("b", "B", "base", make(B, 2)),
        ],
    )]);
    let res = run(
        &index,
        &make(&[(2650.0, 12.0, 0.8), (3500.0, 30.0, 0.5)], 7),
        "",
    );
    assert_eq!(text(&res, "tier"), "T4");
    for id in ["ambiguity", "spectral_twin", "different_form"] {
        assert!(
            alert(&res, id).is_none(),
            "{id} under the to-check threshold"
        );
    }
}

#[test]
fn two_libraries_are_searched_together_and_can_be_restricted() {
    let l1 = library(
        "one",
        &[
            ("a", "A", "base", make(A, 1)),
            ("b", "B", "base", make(B, 2)),
        ],
    );
    let l2 = library(
        "two",
        &[
            ("c", "C", "base", make(C, 3)),
            ("d", "D", "base", make(D, 4)),
        ],
    );
    let index = Index::new(vec![l1, l2]);
    let res = run(&index, &make(C, 7), "");
    let cands = list(&res, "candidates");
    assert_eq!(
        (text(&cands[0], "spectrum_id"), text(&cands[0], "library")),
        ("c", "two")
    );
    let libs: Vec<&str> = cands.iter().map(|c| text(c, "library")).collect();
    assert!(libs.contains(&"one") && libs.contains(&"two"), "{libs:?}");
    assert_eq!(text(&cands[0], "library_version"), "1.0");
    let only_one = run(&index, &make(C, 7), r#"{"libraries":["one"]}"#);
    assert!(list(&only_one, "candidates")
        .iter()
        .all(|c| text(c, "library") == "one"));
    assert_eq!(
        list(&only_one, "libraries")
            .iter()
            .filter(|l| l.get("searched") == Some(&Value::Bool(true)))
            .count(),
        1
    );
    let t = thresholds();
    let bad = parse_options(r#"{"libraries":["nope"]}"#, &t).unwrap();
    assert_eq!(
        search(&index, &make(C, 7), &bad, &t).unwrap_err().error_key,
        "confronti.libreria_sconosciuta"
    );
}

#[test]
fn a_residual_is_searched_and_records_its_role_and_origin() {
    let (a, b) = (make(A, 1), make(B, 2));
    let mix: Vec<f64> = a.y.iter().zip(&b.y).map(|(x, y)| x + 0.6 * y).collect();
    let residual: Vec<f64> = mix.iter().zip(&a.y).map(|(m, x)| m - x).collect();
    let q = Spectrum::new(
        Role::Residual,
        YUnit::Absorbance,
        a.wavenumber_cm1.clone(),
        residual,
    );
    let res = run(&simple_index(), &q, r#"{"origin":"mix-1"}"#);
    assert_eq!(text(&list(&res, "candidates")[0], "spectrum_id"), "b");
    assert_eq!(text(res.get("query").unwrap(), "role"), "residual");
    assert_eq!(text(res.get("query").unwrap(), "origin"), "mix-1");
}

#[test]
fn other_forms_of_the_same_substance_do_not_count_for_the_margin() {
    let mut hcl = A.to_vec();
    hcl[4].0 = 1710.0;
    hcl[2].2 = 0.45;
    let rows = [
        ("a", "A", "base", make(A, 1)),
        ("a-hcl", "A", "hcl", make(&hcl, 6)),
        ("b", "B", "base", make(B, 2)),
    ];
    let res = run(&Index::new(vec![library("lib", &rows)]), &make(A, 8), "");
    let cands = list(&res, "candidates");
    assert_eq!(
        text(&cands[1], "spectrum_id"),
        "a-hcl",
        "the other form ranks second"
    );
    assert_eq!(text(res.get("margin_vs").unwrap(), "form"), "base");
    let expected = num(&cands[0], "r_derivative") - num(&cands[2], "r_derivative");
    assert!(
        (num(&res, "margin") - expected).abs() < 1e-12,
        "margin is over the first other substance"
    );
    assert!(alert(&res, "different_form").is_some());
    assert_eq!(text(&res, "level_proposed"), "probable");
}

#[test]
fn spectral_twins_are_computed_in_blocks_and_reported_when_ready() {
    let mut a2 = A.to_vec();
    a2[3].2 = 0.55;
    let rows = [
        ("a", "A", "base", make(A, 1)),
        ("a2", "A2", "base", make(&a2, 4)),
        ("b", "B", "base", make(B, 2)),
    ];
    let mut index = Index::new(vec![library("lib", &rows)]);
    let before = run(&index, &make(A, 5), "");
    let data = alert(&before, "spectral_twin")
        .expect("twin alert while computing")
        .get("data")
        .unwrap();
    assert_eq!(text(data, "state"), "computing");
    assert_eq!(index.twins_step(2), (2, 3));
    assert_eq!(index.twins_step(256), (3, 3));
    let after = run(&index, &make(A, 5), "");
    let data = alert(&after, "spectral_twin")
        .expect("twin alert")
        .get("data")
        .unwrap();
    assert_eq!(text(data, "state"), "ready");
    let twin = data.get("twin").unwrap();
    assert_eq!(text(twin, "display_name"), "Substance A2");
    let direct = score_derivative(&make(A, 1), &make(&a2, 4)).unwrap();
    assert!(
        (num(twin, "r") - direct).abs() < 1e-6,
        "{} vs {direct}",
        num(twin, "r")
    );
    assert!(num(twin, "r") >= 0.9);
}

#[test]
fn a_narrow_range_can_lift_a_wrong_candidate_but_the_level_stays_to_check() {
    // W shares the bands of Q between 1000 and 1500 and differs everywhere else.
    let w: Bands = &[
        (600.0, 12.0, 0.9),
        (1050.0, 12.0, 0.8),
        (1250.0, 9.0, 0.5),
        (1450.0, 14.0, 0.6),
        (1800.0, 12.0, 0.9),
        (3200.0, 30.0, 0.8),
    ];
    let index = Index::new(vec![library(
        "lib",
        &[
            ("w", "W", "base", make(w, 1)),
            ("b", "B", "base", make(B, 2)),
            ("c", "C", "base", make(C, 3)),
        ],
    )]);
    let q = make(A, 5);
    let full = run(&index, &q, "");
    assert!(
        num(&list(&full, "candidates")[0], "r_derivative") < 0.85,
        "wrong candidate is low on the whole grid"
    );
    assert_eq!(text(&full, "level_proposed"), "not_identified");
    let narrow = run(&index, &q, r#"{"ranges":[[1000,1500]]}"#);
    let top = &list(&narrow, "candidates")[0];
    assert_eq!(text(top, "spectrum_id"), "w");
    assert!(
        num(top, "r_derivative") > 0.95,
        "the narrow range lifts it: {}",
        num(top, "r_derivative")
    );
    assert_eq!(text(&narrow, "level_proposed"), "to_check");
    assert!(list(&narrow, "level_caps")
        .iter()
        .any(|c| c.as_str() == Some("custom_range")));
    assert!(alert(&narrow, "custom_range").is_some());
    assert!(matches!(narrow.get("range_preset"), Some(Value::Null)));
}

#[test]
fn ranges_that_are_too_narrow_are_a_translated_error() {
    let t = thresholds();
    let o = parse_options(r#"{"ranges":[[1000,1100]]}"#, &t).unwrap();
    let e = search(&simple_index(), &make(A, 1), &o, &t).unwrap_err();
    assert_eq!(e.error_key, "confronti.regione_troppo_stretta");
    assert!(
        e.params.iter().any(|(k, v)| *k == "cm1" && v == "102"),
        "{:?}",
        e.params
    );
    let masked = parse_options(r#"{"ranges":[[1900,2400],[1000,1100]]}"#, &t).unwrap();
    assert!(
        search(&simple_index(), &make(A, 1), &masked, &t).is_err(),
        "the mask is always excluded"
    );
}

#[test]
fn a_reference_with_little_coverage_cannot_reach_probable() {
    // All the bands lie above 1300 cm-1, so a reference cut below 1250 still correlates; it just covers 77 % of the points.
    let h: Bands = &[
        (1350.0, 10.0, 0.5),
        (1500.0, 12.0, 0.7),
        (1700.0, 12.0, 0.9),
        (2900.0, 20.0, 0.4),
        (3100.0, 25.0, 0.5),
    ];
    let mut short = make(h, 1);
    for (x, y) in short.wavenumber_cm1.iter().zip(short.y.iter_mut()) {
        if *x < 1250.0 {
            *y = f64::NAN;
        }
    }
    let index = Index::new(vec![library(
        "lib",
        &[("h", "H", "base", short), ("b", "B", "base", make(B, 2))],
    )]);
    let res = run(&index, &make(h, 5), "");
    let top = &list(&res, "candidates")[0];
    assert_eq!(text(top, "spectrum_id"), "h");
    assert!(
        num(top, "coverage") < 0.8 && num(top, "coverage") > 0.6,
        "{}",
        num(top, "coverage")
    );
    assert!(
        num(top, "r_derivative") >= 0.95,
        "{}",
        num(top, "r_derivative")
    );
    assert_eq!(text(&res, "level_proposed"), "to_check");
    assert!(list(&res, "level_caps")
        .iter()
        .any(|c| c.as_str() == Some("coverage")));
}

#[test]
fn transmittance_queries_and_names_without_identity_work() {
    let mut a = make(A, 1);
    a.y.iter_mut().for_each(|v| *v = 100.0 * 10f64.powf(-*v));
    a.y_unit = YUnit::Transmittance;
    let mut l = LibraryCache::new("lib", "1");
    for (id, name, s) in [("a", "Alpha HCl", make(A, 1)), ("b", "Beta", make(B, 2))] {
        l.add(
            LibEntry {
                id: id.into(),
                substance: None,
                inchikey: None,
                display_name: name.into(),
                form: String::new(),
                classes: Vec::new(),
            },
            &s,
        )
        .unwrap();
    }
    let res = run(&Index::new(vec![l]), &a, "");
    assert_eq!(text(&res, "grouping"), "name");
    assert_eq!(text(&list(&res, "candidates")[0], "spectrum_id"), "a");
}

#[test]
fn query_json_and_errors() {
    let q = parse_query(r#"{"wavenumber_cm1":[1,2,3,4,5,6],"y":[0,1,0,1,0,1]}"#).unwrap();
    let t = thresholds();
    let e = search(&simple_index(), &q, &parse_options("", &t).unwrap(), &t).unwrap_err();
    assert!(
        e.error_key.starts_with("confronti.") || e.error_key.starts_with("passi."),
        "{}",
        e.error_key
    );
    let empty = Index::new(vec![LibraryCache::new("e", "1")]);
    let e = search(&empty, &make(A, 1), &parse_options("", &t).unwrap(), &t).unwrap_err();
    assert_eq!(e.error_key, "confronti.nessuna_libreria");
}
