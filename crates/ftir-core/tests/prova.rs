//! Library test on synthetic spectra: known wrong matches, known twins, coverage of forms, blocks and resumption.
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::motore::Motore;
use ftir_core::confronti::prova::Prova;
use ftir_core::confronti::prova_rapporto::{csv, report};
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
        display_name: format!("Substance {substance}"),
        form: form.into(),
    }
}

fn thresholds() -> Thresholds {
    Thresholds::embedded().expect("thresholds")
}

fn index_of(rows: &[(&str, &str, &str, Bands, u64)]) -> Index {
    let mut l = LibraryCache::new("lib", "1.0");
    for (id, sub, form, bands, seed) in rows {
        l.add(entry(id, sub, form), &make(bands, *seed))
            .expect("add");
    }
    Index::new(vec![l])
}

fn finished(index: &Index) -> Prova {
    let mut p = Prova::new(index, &["lib".to_string()]).expect("start");
    p.step(index, 1000);
    p
}

fn json(index: &Index, p: &Prova) -> Value {
    parse(&report(index, p, &thresholds()).expect("report")).expect("json")
}

fn num(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("missing {key}"))
}

const FOUR: [(&str, &str, &str, Bands, u64); 4] = [
    ("a", "A", "base", A, 1),
    ("b", "B", "base", B, 2),
    ("c", "C", "base", C, 3),
    ("d", "D", "base", D, 4),
];

#[test]
fn different_substances_give_no_wrong_probable_and_no_twins() {
    let index = index_of(&FOUR);
    let rep = json(&index, &finished(&index));
    assert_eq!((num(&rep, "done"), num(&rep, "total")), (4.0, 4.0));
    assert_eq!(num(&rep, "probable_wrong"), 0.0);
    assert_eq!(num(&rep, "twins_strong") + num(&rep, "twins_weak"), 0.0);
    let h = rep.get("histogram").unwrap();
    let counts = h.get("counts").and_then(Value::as_arr).unwrap();
    let total: f64 = counts.iter().filter_map(Value::as_f64).sum::<f64>() + num(h, "below");
    assert_eq!(total, 4.0, "every row has a best wrong match");
    assert_eq!(
        rep.get("schema").and_then(Value::as_str),
        Some("prova-libreria/1")
    );
}

#[test]
fn the_same_material_under_two_names_is_a_strong_twin_and_a_wrong_probable() {
    let mut rows = FOUR.to_vec();
    rows.push(("a2", "A2", "base", A, 9));
    let index = index_of(&rows);
    let p = finished(&index);
    let rep = json(&index, &p);
    assert_eq!(num(&rep, "twins_strong"), 1.0, "the pair is listed once");
    let pair = &rep.get("twins_list").and_then(Value::as_arr).unwrap()[0];
    assert!(num(pair, "r") > 0.98);
    let ids: Vec<&str> = ["a", "b"]
        .iter()
        .filter_map(|k| {
            pair.get(k)
                .and_then(|x| x.get("id"))
                .and_then(Value::as_str)
        })
        .collect();
    assert!(ids == ["a", "a2"] || ids == ["a2", "a"], "{ids:?}");
    assert_eq!(
        num(&rep, "probable_wrong"),
        2.0,
        "A finds A2 and A2 finds A"
    );
    let text = csv(&index, &p, &thresholds()).unwrap();
    let kinds: Vec<&str> = text
        .lines()
        .skip(1)
        .filter_map(|l| l.split(',').next())
        .collect();
    assert_eq!(kinds, ["probable_wrong", "probable_wrong", "twin_strong"]);
    assert!(
        text.lines().all(|l| l.split(',').count() == 10),
        "ids and names only: {text}"
    );
}

#[test]
fn a_sibling_form_is_not_a_wrong_match() {
    let index = index_of(&[
        ("a-base", "A", "base", A, 1),
        ("a-hcl", "A", "hydrochloride", A, 5),
        ("b", "B", "base", B, 2),
        ("c", "C", "base", C, 3),
    ]);
    let rep = json(&index, &finished(&index));
    assert_eq!(num(&rep, "probable_wrong"), 0.0);
}

#[test]
fn coverage_counts_substances_with_only_a_base_or_only_a_salt() {
    let index = index_of(&[
        ("a-base", "A", "base", A, 1),
        ("a-hcl", "A", "HCl", A, 5),
        ("b", "B", "Free base", B, 2),
        ("c", "C", "sulfate", C, 3),
        ("d", "D", "", D, 4),
    ]);
    let rep = json(&index, &finished(&index));
    let c = &rep.get("coverage").and_then(Value::as_arr).unwrap()[0];
    let got: Vec<f64> = ["substances", "base_only", "salt_only", "both", "no_form"]
        .iter()
        .map(|k| num(c, k))
        .collect();
    assert_eq!(got, [4.0, 1.0, 1.0, 1.0, 1.0]);
}

#[test]
fn blocks_can_stop_and_carry_on_and_the_memory_stays_small() {
    let index = index_of(&FOUR);
    let whole = finished(&index);
    let mut p = Prova::new(&index, &["lib".to_string()]).unwrap();
    assert_eq!(p.step(&index, 3), (3, 4));
    assert_eq!(p.step(&index, 3), (4, 4));
    assert_eq!((&p.r1, &p.partner), (&whole.r1, &whole.partner));
    assert!(p.memory_bytes() <= 40 * p.total());
}

#[test]
fn fewer_than_two_substances_or_an_unknown_library_is_refused() {
    let index = index_of(&[("a", "A", "base", A, 1), ("a2", "A", "HCl", A, 2)]);
    assert!(Prova::new(&index, &["lib".to_string()]).is_err());
    assert!(Prova::new(&index, &["nope".to_string()]).is_err());
}

#[test]
fn the_engine_resumes_a_test_for_the_same_libraries_and_restarts_for_others() {
    let mut m = Motore::new();
    for (lib, rows) in [("l1", &FOUR[..2]), ("l2", &FOUR[2..])] {
        m.begin(lib, "1.0");
        for (id, sub, form, bands, seed) in rows {
            m.add(lib, entry(id, sub, form), &make(bands, *seed))
                .unwrap();
        }
    }
    let both = ["l1".to_string(), "l2".to_string()];
    assert_eq!(m.prova_start(&both).unwrap(), (0, 4));
    assert_eq!(m.prova_step().unwrap().0, 4);
    assert_eq!(
        m.prova_start(&both).unwrap(),
        (4, 4),
        "same libraries: carries on"
    );
    assert_eq!(
        m.prova_start(&["l1".to_string()]).unwrap(),
        (0, 2),
        "other libraries: from the start"
    );
    assert!(m.prova_report().unwrap().contains("prova-libreria/1"));
    assert!(m.prova_csv().unwrap().starts_with("kind,r,"));
}
