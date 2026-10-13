//! Signal steps, part 2: baselines (parity with pybaselines), ATR correction, subtraction and suggested factor.
use ftir_core::passi::json::{parse, Value};
use ftir_core::passi::sottrazione::{fattore_proposto, subtract};
use ftir_core::passi::{
    correzione_atr, linea_di_base_arpls, linea_di_base_asls, linea_di_base_snip,
};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use ftir_core::synthetic::{generate, true_value, Band, Params};

fn golden(name: &str) -> Value {
    let path = format!(
        "{}/tests/golden/segnale/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    parse(&std::fs::read_to_string(path).expect("golden file")).expect("golden json")
}

fn nums(v: &Value) -> Vec<f64> {
    v.as_arr()
        .expect("array")
        .iter()
        .map(|n| n.as_f64().unwrap_or(f64::NAN))
        .collect()
}

fn field(v: &Value, key: &str) -> Vec<f64> {
    nums(v.get(key).unwrap_or_else(|| panic!("missing {key}")))
}

fn scalar(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("missing {key}"))
}

fn assert_parity(got: &[f64], want: &[f64], tol: f64, what: &str) {
    assert_eq!(got.len(), want.len(), "{what}: length");
    let scale = want
        .iter()
        .filter(|v| v.is_finite())
        .fold(0.0f64, |m, v| m.max(v.abs()))
        .max(1e-300);
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
        assert_eq!(g.is_nan(), w.is_nan(), "{what}[{i}]: absence");
        if w.is_finite() {
            assert!(
                (g - w).abs() <= tol * scale,
                "{what}[{i}]: got {g} want {w}"
            );
        }
    }
}

fn on_grid(y: Vec<f64>) -> Spectrum {
    let x = (0..y.len()).map(|i| 650.0 + 2.0 * i as f64).collect();
    Spectrum::new(Role::Sample, YUnit::Absorbance, x, y)
}

#[test]
fn baselines_match_pybaselines() {
    let doc = golden("linea_di_base");
    for (n, case) in doc
        .get("cases")
        .and_then(Value::as_arr)
        .expect("cases")
        .iter()
        .enumerate()
    {
        let s = on_grid(field(case, "y"));
        let method = case.get("method").and_then(Value::as_str).expect("method");
        let (r, p) = match method {
            "asls" => {
                let p = format!(
                    "{{\"lambda\":{},\"p\":{},\"diff_order\":{},\"output\":\"baseline\"}}",
                    scalar(case, "lambda"),
                    scalar(case, "p"),
                    scalar(case, "diff_order")
                );
                (linea_di_base_asls::apply(&s, &p), p)
            }
            "arpls" => {
                let p = format!(
                    "{{\"lambda\":{},\"diff_order\":2,\"output\":\"baseline\"}}",
                    scalar(case, "lambda")
                );
                (linea_di_base_arpls::apply(&s, &p), p)
            }
            _ => {
                let p = format!(
                    "{{\"max_half_window\":{},\"output\":\"baseline\"}}",
                    scalar(case, "max_half_window")
                );
                (linea_di_base_snip::apply(&s, &p), p)
            }
        };
        let tol = case
            .get("tolerance")
            .and_then(Value::as_f64)
            .unwrap_or(1e-9);
        assert_parity(
            &r.expect(method).y,
            &field(case, "expected"),
            tol,
            &format!("{method} case {n} {p}"),
        );
    }
}

#[test]
fn corrected_is_spectrum_minus_baseline_and_keeps_the_original() {
    let s = on_grid(field(
        &golden("linea_di_base")
            .get("cases")
            .and_then(Value::as_arr)
            .expect("cases")[1],
        "y",
    ));
    let b = linea_di_base_asls::apply(&s, r#"{"output":"baseline"}"#).expect("baseline");
    let c = linea_di_base_asls::apply(&s, "{}").expect("corrected");
    for i in 0..s.len() {
        assert!((c.y[i] - (s.y[i] - b.y[i])).abs() < 1e-15);
    }
    assert!(
        s.history.is_empty()
            && c.history.len() == 1
            && c.history[0].starts_with("linea_di_base_asls/1 {")
    );
    assert_eq!(linea_di_base_asls::baseline(&s, "{}").expect("vector"), b.y);
}

#[test]
fn asls_recovers_a_known_baseline_away_from_the_bands() {
    let mut p = Params::demo();
    p.from_cm1 = 650.0;
    p.to_cm1 = 3800.0;
    p.step_cm1 = 2.0;
    p.bands = vec![
        Band {
            center_cm1: 1100.0,
            half_width_cm1: 10.0,
            height: 0.8,
        },
        Band {
            center_cm1: 1700.0,
            half_width_cm1: 12.0,
            height: 0.5,
        },
        Band {
            center_cm1: 2900.0,
            half_width_cm1: 20.0,
            height: 0.4,
        },
    ];
    p.baseline_offset = 0.10;
    p.baseline_slope = 0.06;
    p.noise = 0.0;
    let s = generate(&p);
    let ascending = Spectrum::new(
        Role::Sample,
        YUnit::Absorbance,
        s.wavenumber_cm1.iter().rev().cloned().collect(),
        s.y.iter().rev().cloned().collect(),
    );
    let b = linea_di_base_asls::apply(&ascending, r#"{"output":"baseline"}"#).expect("baseline");
    let mut checked = 0;
    for (x, v) in ascending.wavenumber_cm1.iter().zip(&b.y) {
        let far = p
            .bands
            .iter()
            .all(|band| (x - band.center_cm1).abs() > 150.0);
        if far {
            let truth =
                p.baseline_offset + p.baseline_slope * (x - p.from_cm1) / (p.to_cm1 - p.from_cm1);
            assert!(
                (v - truth).abs() < 0.01,
                "at {x}: baseline {v} truth {truth} (spectrum {})",
                true_value(&p, *x)
            );
            checked += 1;
        }
    }
    assert!(checked > 800, "{checked}");
}

#[test]
fn atr_correction_scales_by_wavenumber_only() {
    let s = Spectrum::new(
        Role::Reference,
        YUnit::Absorbance,
        vec![500.0, 1000.0, 2000.0, 3000.0],
        vec![1.0, 1.0, f64::NAN, 0.5],
    );
    let r = correzione_atr::apply(&s, "{}").expect("atr");
    assert_eq!(
        r.wavenumber_cm1, s.wavenumber_cm1,
        "positions are not corrected"
    );
    assert_eq!((r.y[0], r.y[1], r.y[3]), (0.5, 1.0, 1.5));
    assert!(r.y[2].is_nan());
    assert_eq!(r.role, Role::Reference);
    let t = Spectrum::new(Role::Reference, YUnit::Transmittance, vec![1.0], vec![50.0]);
    assert_eq!(
        correzione_atr::apply(&t, "{}").unwrap_err().error_key,
        "passi.parametro_non_valido"
    );
    assert!(correzione_atr::apply(&s, r#"{"ref_cm1":0}"#).is_err());
}

/// Sum of Gaussian bands (centre, sigma, height) on the default grid; compact tails keep the two components apart.
fn bands(list: &[(f64, f64, f64)]) -> Vec<f64> {
    (0..1576)
        .map(|i| {
            let x = 650.0 + 2.0 * i as f64;
            list.iter()
                .map(|(c, w, h)| h * (-0.5 * ((x - c) / w).powi(2)).exp())
                .sum()
        })
        .collect()
}

fn scaled(i: usize) -> f64 {
    2.0 * (2.0 * i as f64) / 3150.0 - 1.0
}

fn pair() -> (Vec<f64>, Vec<f64>) {
    // With a free background the factor of two positive, disjoint components is biased by about ΣA·ΣB / (n·ΣB²):
    // here the sample component is small (area ≈ 2) so the bias stays near 0.004.
    let a = bands(&[(1250.0, 3.0, 0.2), (1700.0, 4.0, 0.15), (3300.0, 6.0, 0.1)]);
    let b = bands(&[(1100.0, 6.0, 0.7), (1500.0, 8.0, 0.5), (2950.0, 10.0, 0.6)]);
    (a, b)
}

#[test]
fn subtraction_with_the_exact_factor_gives_back_the_other_component() {
    let (a, b) = pair();
    let sample = on_grid(a.iter().zip(&b).map(|(a, b)| a + 0.6 * b).collect());
    let reference = on_grid(b);
    let p = fattore_proposto(&sample, &reference, r#"{"baseline":false}"#).expect("proposal");
    assert!((p.k - 0.60).abs() <= 0.01, "k = {}", p.k);
    let r = subtract(
        &sample,
        &reference,
        r#"{"k":0.6,"baseline":false,"reference_id":"B7","library":"Lib"}"#,
    )
    .expect("subtract");
    assert_eq!(r.residual.role, Role::Residual);
    for (got, want) in r.residual.y.iter().zip(&a) {
        assert!((got - want).abs() < 1e-9);
    }
    assert_eq!(
        r.residual.history.last().map(String::as_str),
        Some("sottratto: B7, Lib, k = 0.60")
    );
    assert!(sample.history.is_empty(), "the sample is never changed");
    assert!(
        r.zone_minimum.is_some_and(|m| m > -1e-9),
        "{:?}",
        r.zone_minimum
    );
    let over = subtract(&sample, &reference, r#"{"k":1.2,"baseline":false}"#).expect("over");
    assert!(
        over.zone_minimum.is_some_and(|m| m < -0.05),
        "over-subtraction is visible: {:?}",
        over.zone_minimum
    );
}

#[test]
fn a_straight_background_does_not_distort_the_factor() {
    let (a, b) = pair();
    let y = (0..1576)
        .map(|i| a[i] + 0.6 * b[i] + 0.05 + 0.03 * scaled(i))
        .collect();
    let (sample, reference) = (on_grid(y), on_grid(b));
    let p = fattore_proposto(&sample, &reference, r#"{"baseline":false}"#).expect("proposal");
    assert!((p.k - 0.60).abs() <= 0.01, "k = {}", p.k);
    assert!(
        (p.background[0] - (0.05 - 0.03)).abs() < 5e-3 && (p.background[1575] - 0.08).abs() < 5e-3,
        "the background is found within the bias"
    );
    let r = subtract(&sample, &reference, r#"{"k":0.6,"baseline":false}"#).expect("subtract");
    let bg = 0.05 + 0.03 * scaled(10);
    assert!(
        (r.residual.y[10] - (a[10] + bg)).abs() < 1e-9,
        "the fitted background is not subtracted"
    );
    let with_baseline = fattore_proposto(&sample, &reference, "{}").expect("with asls");
    assert!(
        (with_baseline.k - 0.60).abs() <= 0.05,
        "k with AsLS = {}",
        with_baseline.k
    );
}

#[test]
fn factor_is_never_negative_and_matches_numpy() {
    for case in golden("fattore")
        .get("cases")
        .and_then(Value::as_arr)
        .expect("cases")
    {
        let (sample, reference) = (
            on_grid(field(case, "sample")),
            on_grid(field(case, "reference")),
        );
        let p = fattore_proposto(&sample, &reference, r#"{"baseline":false}"#).expect("proposal");
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");
        assert!(p.k >= 0.0 && p.k_unrounded >= 0.0, "{name}");
        assert!(
            (p.k_unrounded - scalar(case, "k")).abs() < 1e-9,
            "{name}: {} vs {}",
            p.k_unrounded,
            scalar(case, "k")
        );
        let (a, b) = (scalar(case, "a"), scalar(case, "b"));
        assert!(
            (p.background[0] - (a - b)).abs() < 1e-9 && (p.background[1575] - (a + b)).abs() < 1e-9,
            "{name}"
        );
        assert_eq!(p.k, (p.k_unrounded * 100.0).round() / 100.0);
    }
}

#[test]
fn overlap_only_and_errors() {
    let (a, b) = pair();
    let sample = on_grid(a.iter().zip(&b).map(|(a, b)| a + 0.6 * b).collect());
    let short = Spectrum::new(
        Role::Reference,
        YUnit::Absorbance,
        (0..1200).map(|i| 700.0 + 2.0 * i as f64).collect(),
        b[25..1225].to_vec(),
    );
    let r = subtract(&sample, &short, r#"{"k":0.5,"baseline":false}"#).expect("overlap");
    let x = &r.residual.wavenumber_cm1;
    for (i, v) in r.residual.y.iter().enumerate() {
        assert_eq!(v.is_nan(), !(700.0..=3098.0).contains(&x[i]), "{}", x[i]);
    }
    let flat = on_grid(vec![0.0; 1576]);
    assert_eq!(
        fattore_proposto(&sample, &flat, r#"{"baseline":false}"#)
            .unwrap_err()
            .error_key,
        "passi.fattore_indeterminato"
    );
    assert!(subtract(&sample, &short, r#"{"k":-1}"#).is_err());
    assert!(subtract(&sample, &short, r#"{"zz":1}"#).is_err());
}
