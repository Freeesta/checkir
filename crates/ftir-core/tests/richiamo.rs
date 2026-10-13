//! Recalled references on synthetic spectra: the r of the recall is the r of the comparison row; the four scales.
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::pearson::{score_derivative, score_spectrum};
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::parse;
use ftir_core::richiamo::{recall, recall_json};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

fn make(bands: &[(f64, f64, f64)], seed: u64, offset: f64) -> Spectrum {
    generate(&Params {
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
        baseline_offset: offset,
        baseline_slope: 0.03,
        noise: 0.0005,
        seed,
    })
}

const A: &[(f64, f64, f64)] = &[(800.0, 10.0, 0.5), (1050.0, 12.0, 0.8), (1700.0, 12.0, 0.9)];
const B: &[(f64, f64, f64)] = &[(950.0, 11.0, 0.7), (1150.0, 10.0, 0.9), (1600.0, 15.0, 0.7)];

#[test]
fn r_of_the_recall_is_the_r_of_the_comparison_row() {
    let (sample, reference) = (make(A, 1, 0.02), make(B, 2, 0.02));
    let mut l = LibraryCache::new("lib", "1.0");
    let e = LibEntry {
        id: "b".into(),
        substance: Some("B".into()),
        display_name: "B".into(),
        form: "base".into(),
        classes: Vec::new(),
    };
    l.add(e, &reference).expect("add");
    let t = Thresholds::embedded().expect("thresholds");
    let out = search(
        &Index::new(vec![l]),
        &sample,
        &parse_options("", &t).expect("o"),
        &t,
    )
    .expect("search");
    let row = out.candidates[0].r_derivative;
    let got = recall(&sample, &reference, "raw").expect("recall");
    // The library matrix is f32; the direct score is f64 on the same grid.
    assert!((got.r_derivata.unwrap() - row).abs() < 1e-6);
    assert!(
        (got.r_derivata.unwrap() - score_derivative(&sample, &reference).unwrap()).abs() < 1e-12
    );
    assert!((got.r.unwrap() - score_spectrum(&sample, &reference).unwrap()).abs() < 1e-12);
}

#[test]
fn scales_agree_on_a_pure_multiple_and_raw_is_one() {
    let reference = make(A, 1, 0.0);
    let mut sample = reference.clone();
    sample.y.iter_mut().for_each(|v| *v *= 2.0);
    for s in ["max", "area", "lsq"] {
        let k = recall(&sample, &reference, s).expect("recall").k;
        assert!((k - 2.0).abs() < 1e-9, "{s}: {k}");
    }
    assert_eq!(recall(&sample, &reference, "raw").unwrap().k, 1.0);
    let r = recall(&sample, &reference, "lsq").unwrap();
    assert!((r.r_derivata.unwrap() - 1.0).abs() < 1e-9 && (r.r.unwrap() - 1.0).abs() < 1e-9);
}

#[test]
fn unknown_scale_is_an_error_and_json_is_well_formed() {
    let (s, r) = (make(A, 1, 0.0), make(B, 2, 0.0));
    assert_eq!(
        recall(&s, &r, "x").unwrap_err().error_key,
        "richiamo.scala_sconosciuta"
    );
    let j = parse(&recall_json(&s, &r, r#"{"scale":"area"}"#).unwrap()).unwrap();
    assert_eq!(j.get("scale").and_then(|v| v.as_str()), Some("area"));
    assert!(j.get("k").and_then(|v| v.as_f64()).unwrap() > 0.0);
}
