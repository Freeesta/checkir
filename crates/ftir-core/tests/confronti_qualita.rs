//! Package CONFRONTO PR 2: HQI beside r, the alert `form_absent`, the alerts about the measurement (`quality_*`,
//! `same_as_previous`) on synthetic spectra. Every alert must carry the numbers that raised it.
use ftir_core::confronti::cerca::{search, search_with};
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::motore::Motore;
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::prepare;
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type Bands<'a> = &'a [(f64, f64, f64)];

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

fn spectrum(bands: Bands, extra: Bands, scale: f64, noise: f64, seed: u64) -> Spectrum {
    let band = |(c, w, h): &(f64, f64, f64)| Band {
        center_cm1: *c,
        half_width_cm1: *w,
        height: *h,
    };
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 600.0,
        step_cm1: 2.0,
        bands: bands
            .iter()
            .map(|b| band(&(b.0, b.1, b.2 * scale)))
            .chain(extra.iter().map(band))
            .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.03,
        noise,
        seed,
    })
}

fn good(bands: Bands, seed: u64) -> Spectrum {
    spectrum(bands, &[], 1.0, 0.0005, seed)
}

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

fn index(rows: &[(&str, &str, &str, Spectrum)]) -> Index {
    let mut l = LibraryCache::new("lib", "1.0");
    for (id, sub, form, s) in rows {
        l.add(entry(id, sub, form), s).expect("add");
    }
    Index::new(vec![l])
}

fn simple() -> Index {
    index(&[
        ("a", "A", "base", good(A, 1)),
        ("b", "B", "base", good(B, 2)),
    ])
}

fn run_with(i: &Index, q: &Spectrum, options: &str, previous: Option<&[f64]>) -> Value {
    let t = Thresholds::embedded().expect("thresholds");
    let o = parse_options(options, &t).expect("options");
    let out = search_with(i, q, &o, &t, previous).expect("search");
    parse(&out.to_json(i)).expect("result json")
}

fn run(q: &Spectrum, options: &str) -> Value {
    run_with(&simple(), q, options, None)
}

fn alerts(res: &Value) -> Vec<&Value> {
    res.get("alerts")
        .and_then(Value::as_arr)
        .unwrap()
        .iter()
        .collect()
}

fn ids(res: &Value) -> Vec<String> {
    alerts(res)
        .iter()
        .map(|a| a.get("id").and_then(Value::as_str).unwrap().to_string())
        .collect()
}

fn find<'a>(res: &'a Value, id: &str) -> Option<&'a Value> {
    alerts(res)
        .into_iter()
        .find(|a| a.get("id").and_then(Value::as_str) == Some(id))
}

fn data<'a>(res: &'a Value, id: &str) -> &'a Value {
    let d = find(res, id).unwrap_or_else(|| panic!("no alert {id}: {:?}", ids(res)));
    let d = d.get("data").unwrap();
    assert!(
        matches!(d, Value::Obj(v) if !v.is_empty()),
        "{id} carries no data"
    );
    d
}

fn quality(res: &Value) -> Vec<String> {
    ids(res)
        .into_iter()
        .filter(|i| i.starts_with("quality_"))
        .collect()
}

fn f(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("no {key}"))
}

#[test]
fn a_good_measurement_raises_no_quality_alert() {
    let res = run(&good(A, 5), "");
    assert_eq!(quality(&res), Vec::<String>::new());
}

#[test]
fn hqi_is_listed_beside_r_and_follows_it() {
    let res = run(&good(A, 5), "");
    let top = &res.get("candidates").and_then(Value::as_arr).unwrap()[0];
    let (r, hqi) = (f(top, "r_derivative"), f(top, "hqi_euclidean"));
    assert!((hqi - 50.0 * (1.0 + r)).abs() < 1e-9);
    assert!(hqi > 99.0);
}

#[test]
fn saturation_is_reported_with_the_value_and_the_place() {
    let res = run(&spectrum(A, &[], 3.0, 0.0005, 5), "");
    let d = data(&res, "quality_saturation");
    assert!(f(d, "max_absorbance") > 1.5 && f(d, "limit") == 1.5);
    assert!((f(d, "at_cm1") - 1700.0).abs() < 10.0);
}

#[test]
fn a_weak_signal_and_a_low_signal_to_noise_ratio_are_reported_apart() {
    let weak = run(&spectrum(A, &[], 0.01, 0.0005, 5), "");
    assert!(f(data(&weak, "quality_weak_signal"), "strongest_band") < 0.02);
    assert!(find(&weak, "quality_noise").is_some());
    let noisy = run(&spectrum(A, &[], 1.0, 0.02, 5), "");
    let d = data(&noisy, "quality_noise");
    assert!(f(d, "ratio") < 100.0 && f(d, "noise") > 0.01);
    assert!(find(&noisy, "quality_weak_signal").is_none());
}

#[test]
fn co2_and_water_vapour_are_told_apart() {
    let co2 = run(&spectrum(A, &[(2350.0, 5.0, 0.1)], 1.0, 0.0005, 5), "");
    let d = data(&co2, "quality_co2_vapour");
    assert!(d.get("co2").is_some() && d.get("vapour").is_none());
    assert!((f(d.get("co2").unwrap(), "at_cm1") - 2350.0).abs() < 6.0);
    let lines: Vec<(f64, f64, f64)> = (0..10)
        .map(|k| (3710.0 + 20.0 * f64::from(k), 2.0, 0.05))
        .collect();
    let vapour = run(&spectrum(A, &lines, 1.0, 0.0005, 5), "");
    let d = data(&vapour, "quality_co2_vapour");
    assert!(d.get("vapour").is_some() && d.get("co2").is_none());
}

#[test]
fn negative_bands_count_only_when_wide_and_outside_the_mask() {
    let dip = run(&spectrum(A, &[(1350.0, 15.0, -0.2)], 1.0, 0.0005, 5), "");
    let d = data(&dip, "quality_negative_bands");
    assert!(f(d, "minimum") < -0.05 && (f(d, "at_cm1") - 1350.0).abs() < 6.0);
    assert!(f(d, "to_cm1") - f(d, "from_cm1") >= 10.0);
    let masked = run(&spectrum(A, &[(2100.0, 30.0, -0.2)], 1.0, 0.0005, 5), "");
    assert!(find(&masked, "quality_negative_bands").is_none());
    let mut spike = good(A, 5);
    let k = spike.y.len() / 2;
    spike.y[k] = -0.2;
    assert!(find(&run(&spike, ""), "quality_negative_bands").is_none());
}

#[test]
fn the_same_sample_twice_is_reported_and_a_different_one_is_not() {
    let t = Thresholds::embedded().unwrap();
    let prev = prepare(&good(A, 5)).unwrap().deriv;
    let again = run_with(&simple(), &good(A, 6), "", Some(&prev));
    let d = data(&again, "same_as_previous");
    assert!(f(d, "r") >= f(d, "limit") && f(d, "limit") == t.same_as_previous_r);
    let other = run_with(&simple(), &good(B, 6), "", Some(&prev));
    assert!(find(&other, "same_as_previous").is_none());
    assert!(find(&run(&good(A, 6), ""), "same_as_previous").is_none());
}

fn query_json(s: &Spectrum) -> String {
    let nums = |v: &[f64]| {
        v.iter()
            .map(|x| x.to_string())
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        r#"{{"role":"sample","wavenumber_cm1":[{}],"y":[{}]}}"#,
        nums(&s.wavenumber_cm1),
        nums(&s.y)
    )
}

fn session_options(id: &str) -> String {
    format!(r#"{{"sample_id":"{id}"}}"#)
}

#[test]
fn the_engine_compares_with_the_sample_before_it_in_the_session() {
    let mut m = Motore::new();
    m.begin("lib", "1.0");
    m.add("lib", entry("a", "A", "base"), &good(A, 1)).unwrap();
    m.add("lib", entry("b", "B", "base"), &good(B, 2)).unwrap();
    let mut go = |s: &Spectrum, id: &str| {
        let out = m.compare(&query_json(s), &session_options(id)).unwrap();
        find_in(&parse(&out).unwrap())
    };
    assert!(!go(&good(A, 10), "s1"));
    assert!(go(&good(A, 11), "s2"));
    assert!(
        go(&good(A, 11), "s2"),
        "the same sample searched again keeps the one before it"
    );
    assert!(!go(&good(B, 12), "s3"));
    assert!(!go(&good(B, 12), "s3"));
}

fn find_in(res: &Value) -> bool {
    find(res, "same_as_previous").is_some()
}

#[test]
fn a_missing_form_is_reported_with_what_the_library_has() {
    let i = index(&[
        ("a", "A", "base", good(A, 1)),
        ("b", "B", "base", good(B, 2)),
        ("b-hcl", "B", "hydrochloride", good(B, 3)),
    ]);
    let q = good(A, 7);
    let res = run_with(&i, &q, r#"{"expected_form":" Hydrochloride "}"#, None);
    let d = data(&res, "form_absent");
    assert_eq!(
        d.get("expected_form").and_then(Value::as_str),
        Some("hydrochloride")
    );
    let forms = d.get("forms_in_library").and_then(Value::as_arr).unwrap();
    assert_eq!(forms.len(), 1);
    for options in [r#"{"expected_form":"BASE"}"#, "{}"] {
        assert!(find(&run_with(&i, &q, options, None), "form_absent").is_none());
    }
    let b_hcl = run_with(
        &i,
        &good(B, 8),
        r#"{"expected_form":"hydrochloride"}"#,
        None,
    );
    assert!(find(&b_hcl, "form_absent").is_none());
    let t = Thresholds::embedded().unwrap();
    let o = parse_options("{}", &t).unwrap();
    assert!(search(&i, &q, &o, &t).is_ok());
}
