//! Identification tiers T2-T4, the `low_signal` state of a region and the cap `sampling_not_calibrated`, on synthetic
//! spectra.
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::Spectrum;
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
fn entry(id: &str, substance: &str, form: &str) -> LibEntry {
    LibEntry {
        id: id.into(),
        substance: Some(substance.into()),
        display_name: format!("Substance {substance}"),
        form: form.into(),
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

fn index_with(sampling: Option<&str>) -> Index {
    let mut l = library(
        "lib",
        &[
            ("a", "A", "base", make(A, 1)),
            ("b", "B", "base", make(B, 2)),
            ("c", "C", "base", make(C, 3)),
        ],
    );
    l.sampling = sampling.map(str::to_string);
    Index::new(vec![l])
}

fn caps(res: &Value) -> Vec<&str> {
    list(res, "level_caps")
        .iter()
        .filter_map(Value::as_str)
        .collect()
}

#[test]
fn tiers_follow_the_proposed_level() {
    let res = run(&index_with(None), &make(A, 9), "");
    assert_eq!(
        (text(&res, "level_proposed"), text(&res, "tier")),
        ("probable", "T2")
    );
    let unrelated = make(&[(2000.0, 10.0, 0.5), (3600.0, 10.0, 0.4)], 5);
    let res = run(&index_with(None), &unrelated, "");
    assert_eq!(
        text(&res, "tier"),
        if text(&res, "level_proposed") == "to_check" {
            "T3"
        } else {
            "T4"
        }
    );
    let res = run(&index_with(None), &make(A, 9), r#"{"ranges":[[800,1500]]}"#);
    assert_eq!(
        (text(&res, "level_proposed"), text(&res, "tier")),
        ("to_check", "T3")
    );
}

#[test]
fn a_different_sampling_method_blocks_t2() {
    let q = make(A, 9);
    let same = run(&index_with(Some("ATR")), &q, r#"{"sampling":"ATR"}"#);
    assert_eq!((text(&same, "tier"), caps(&same)), ("T2", vec![]));
    let other = run(
        &index_with(Some("ATR")),
        &q,
        r#"{"sampling":"transmission"}"#,
    );
    assert_eq!(text(&other, "tier"), "T3");
    assert_eq!(caps(&other), vec!["sampling_not_calibrated"]);
    let unknown = run(&index_with(None), &q, r#"{"sampling":"transmission"}"#);
    assert_eq!(text(&unknown, "tier"), "T2");
    let undeclared = run(&index_with(Some("ATR")), &q, "");
    assert_eq!(text(&undeclared, "tier"), "T2");
}

#[test]
fn sampling_ids_decide_the_cap_and_are_recorded_in_the_result() {
    let q = make(A, 9);
    let on = |lib: Option<&str>, sample: &str| {
        let opt = format!(r#"{{"sampling":"{sample}"}}"#);
        run(&index_with(lib), &q, &opt)
    };
    let same = on(Some("atr_diamond"), "atr_diamond");
    assert_eq!((text(&same, "tier"), caps(&same)), ("T2", vec![]));
    let other = on(Some("atr_diamond"), "transmission_kbr");
    assert_eq!(
        (text(&other, "tier"), caps(&other)),
        ("T3", vec!["sampling_not_calibrated"])
    );
    let crystal = on(Some("atr_diamond"), "atr_ge");
    assert_eq!(caps(&crystal), vec!["sampling_not_calibrated"]);
    // `unknown` on either side is "not said": no cap, and the result records null.
    for res in [
        on(Some("atr_diamond"), "unknown"),
        on(Some("unknown"), "atr_ge"),
    ] {
        assert_eq!((text(&res, "tier"), caps(&res)), ("T2", vec![]));
    }
    let query = other.get("query").expect("query");
    assert_eq!(
        query.get("sampling").and_then(Value::as_str),
        Some("transmission_kbr")
    );
    let lib = &list(&other, "libraries")[0];
    assert_eq!(
        lib.get("sampling").and_then(Value::as_str),
        Some("atr_diamond")
    );
    let none = on(None, "unknown");
    assert_eq!(
        none.get("query").and_then(|x| x.get("sampling")),
        Some(&Value::Null)
    );
    assert_eq!(
        list(&none, "libraries")[0].get("sampling"),
        Some(&Value::Null)
    );
}

#[test]
fn a_region_without_signal_is_low_signal_not_a_disagreement() {
    let res = run(&index_with(None), &make(A, 9), "");
    let signal = res.get("region_signal").expect("region_signal");
    let top = &list(&res, "candidates")[0];
    let states = top.get("region_states").expect("region_states");
    for id in ["3700-2500", "1900-1500", "1500-1000", "1000-650"] {
        let share = num(signal, id);
        assert!((0.0..=1.0).contains(&share), "{id}: {share}");
        let state = text(states, id);
        assert_eq!(state == "low_signal", share < 0.01, "{id}: {state} {share}");
    }
    let low = make(
        &[
            (800.0, 10.0, 0.5),
            (1050.0, 12.0, 0.8),
            (1250.0, 9.0, 0.5),
            (1450.0, 14.0, 0.6),
        ],
        7,
    );
    let res = run(&index_with(None), &low, "");
    let share = num(res.get("region_signal").unwrap(), "3700-2500");
    assert!(share < 0.01, "share {share}");
    let states = list(&res, "candidates")[0]
        .get("region_states")
        .unwrap()
        .clone();
    assert_eq!(text(&states, "3700-2500"), "low_signal");
}

#[test]
fn region_states_follow_the_thresholds() {
    let a = thresholds().region_agreement;
    assert_eq!(a.state(Some(0.9), 0.3), "agrees");
    assert_eq!(a.state(Some(0.89), 0.3), "partial");
    assert_eq!(a.state(Some(0.7), 0.3), "partial");
    assert_eq!(a.state(Some(0.69), 0.3), "disagrees");
    assert_eq!(a.state(Some(0.1), 0.0099), "low_signal");
    assert_eq!(a.state(Some(0.1), 0.01), "disagrees");
    assert_eq!(a.state(None, 0.5), "unknown");
}
