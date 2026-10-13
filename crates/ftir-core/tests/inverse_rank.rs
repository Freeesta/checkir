//! Inverse search over several libraries (`peak_index::rank`) and the scaled reference of the overlay
//! (`reference::reference_scale`), on synthetic spectra with known bands.
use ftir_core::peak_index::query::{Query, QueryResult, Want};
use ftir_core::peak_index::rank::rank;
use ftir_core::peak_index::PeakIndex;
use ftir_core::peaks::Thresholds;
use ftir_core::reference::{reference_scale, reference_scaled};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type Bands = &'static [(f64, f64, f64)];

fn spectrum(bands: Bands) -> Spectrum {
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
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
        baseline_slope: 0.04,
        noise: 0.0005,
        seed: 3,
    })
}

fn index(library: &[Bands]) -> PeakIndex {
    let spectra: Vec<Spectrum> = library.iter().map(|b| spectrum(b)).collect();
    PeakIndex::build(&spectra, &Thresholds::embedded().expect("thresholds"))
}

fn ask(i: &PeakIndex, positions: &[f64], limit: usize) -> QueryResult {
    let q = Query {
        wanted: positions
            .iter()
            .map(|p| Want {
                position_cm1: *p,
                tolerance_cm1: None,
            })
            .collect(),
        absent: vec![],
        min_found: Some(1),
        limit,
    };
    let tol = Thresholds::embedded().expect("thresholds").tolerances;
    i.query(&q, &tol).expect("query")
}

fn libraries() -> (PeakIndex, PeakIndex) {
    let a = index(&[
        &[(1712.0, 8.0, 1.0), (1275.0, 6.0, 0.2)],
        &[(1708.0, 8.0, 1.0)],
    ]);
    let b = index(&[
        &[(1712.0, 8.0, 1.0), (1275.0, 6.0, 0.9)],
        &[(1275.0, 6.0, 0.5), (1000.0, 10.0, 1.0)],
    ]);
    (a, b)
}

#[test]
fn bands_found_come_first_then_prominence_across_libraries() {
    let (a, b) = libraries();
    let ranked = rank(vec![
        ("a".into(), ask(&a, &[1712.0, 1275.0], 10)),
        ("b".into(), ask(&b, &[1712.0, 1275.0], 10)),
    ]);
    let order: Vec<(&str, u32, usize)> = ranked
        .hits
        .iter()
        .map(|(l, h)| (l.as_str(), h.spectrum, h.found.len()))
        .collect();
    // Two bands: b/0 (both strong) before a/0 (one weak); one band: a/1 (1708, strong) before b/1 (1275, medium).
    assert_eq!(order[0], ("b", 0, 2));
    assert_eq!(order[1], ("a", 0, 2));
    assert!(order[2..].iter().all(|(_, _, n)| *n == 1));
    assert_eq!(ranked.total, 4);
    assert!(!ranked.truncated);
}

#[test]
fn ties_keep_the_library_order_and_the_answer_order() {
    let (a, _) = libraries();
    let one = ask(&a, &[1712.0], 10);
    let ranked = rank(vec![("x".into(), one.clone()), ("y".into(), one)]);
    let libs: Vec<&str> = ranked.hits.iter().map(|(l, _)| l.as_str()).collect();
    assert_eq!(libs, vec!["x", "y", "x", "y"][..libs.len()].to_vec());
    assert_eq!(libs.iter().filter(|l| **l == "x").count(), libs.len() / 2);
}

#[test]
fn truncation_and_the_json_carry_the_library() {
    let (a, b) = libraries();
    let ranked = rank(vec![
        ("a".into(), ask(&a, &[1712.0, 1275.0], 1)),
        ("b".into(), ask(&b, &[1712.0, 1275.0], 10)),
    ]);
    assert!(ranked.truncated);
    let j = ftir_core::passi::json::parse(&ranked.to_json(&["c".to_string()], 0)).expect("json");
    let first = &j.get("hits").and_then(|h| h.as_arr()).expect("hits")[0];
    assert_eq!(first.get("lib").and_then(|v| v.as_str()), Some("b"));
    let missing = j.get("missing").and_then(|m| m.as_arr()).expect("missing");
    assert_eq!(missing[0].as_str(), Some("c"));
}

#[test]
fn reference_is_scaled_to_the_sample_outside_the_excluded_zone() {
    let sample = spectrum(&[(1700.0, 8.0, 0.5), (2100.0, 8.0, 3.0), (1000.0, 8.0, 0.2)]);
    let reference = spectrum(&[(1700.0, 8.0, 2.0), (2100.0, 8.0, 9.0), (1000.0, 8.0, 0.8)]);
    let s = (&sample.wavenumber_cm1[..], &sample.y[..]);
    let r = (&reference.wavenumber_cm1[..], &reference.y[..]);
    let k = reference_scale(s, r, (1900.0, 2400.0));
    // The 2100 band lies in the excluded zone: the highest bands are 1700 in both, so k ≈ 0.25 (plus baseline).
    assert!((k - 0.25).abs() < 0.02, "{k}");
    let scaled = reference_scaled(s, r, (1900.0, 2400.0));
    assert_eq!(scaled.len(), reference.y.len());
    assert!((scaled[10] - reference.y[10] * k).abs() < 1e-12);
    // Without the zone the 2100 bands decide: k ≈ 1/3.
    let k_all = reference_scale(s, r, (0.0, 0.0));
    assert!((k_all - 1.0 / 3.0).abs() < 0.02, "{k_all}");
}

#[test]
fn reference_scale_is_one_without_a_positive_band_and_ignores_points_outside_the_reference() {
    let x = [1000.0, 1100.0, 1200.0];
    assert_eq!(
        reference_scale((&x, &[0.0, -1.0, 0.0]), (&x, &[1.0, 2.0, 1.0]), (0.0, 0.0)),
        1.0
    );
    assert_eq!(
        reference_scale((&x, &[1.0, 2.0, 1.0]), (&[], &[]), (0.0, 0.0)),
        1.0
    );
    // The sample is 5 high at 900, outside the reference: it does not count.
    let sx = [900.0, 1000.0, 1100.0, 1200.0];
    let k = reference_scale(
        (&sx, &[5.0, 1.0, 4.0, 1.0]),
        (&x, &[1.0, 2.0, 1.0]),
        (0.0, 0.0),
    );
    assert!((k - 2.0).abs() < 1e-12, "{k}");
}
