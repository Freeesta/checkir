//! Signal steps: parity with the SciPy/NumPy reference (golden/segnale), synthetic truth, chain `confronto_v1`.
use ftir_core::passi::catene::{run, CONFRONTO_V1};
use ftir_core::passi::json::{parse, Value};
use ftir_core::passi::{griglia, maschera, normalizza, savitzky_golay, trasmittanza};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use ftir_core::synthetic::{generate, true_value, Band, Params};

fn golden(name: &str) -> Value {
    let path = format!(
        "{}/tests/golden/segnale/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    parse(&std::fs::read_to_string(path).expect("golden file")).expect("golden json")
}

/// Array of numbers; `null` is an absent point (NaN).
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

/// Same absent points, and every other point within 1e-9 relative to the largest magnitude of the reference.
fn assert_parity(got: &[f64], want: &[f64], what: &str) {
    assert_eq!(got.len(), want.len(), "{what}: length");
    let scale = want
        .iter()
        .filter(|v| v.is_finite())
        .fold(0.0f64, |m, v| m.max(v.abs()))
        .max(1e-300);
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
        assert_eq!(
            g.is_nan(),
            w.is_nan(),
            "{what}[{i}]: absence got {g} want {w}"
        );
        if w.is_finite() {
            assert!(
                (g - w).abs() <= 1e-9 * scale,
                "{what}[{i}]: got {g} want {w} (scale {scale})"
            );
        }
    }
}

fn sample(x: Vec<f64>, y: Vec<f64>) -> Spectrum {
    Spectrum::new(Role::Sample, YUnit::Absorbance, x, y)
}

#[test]
fn savitzky_golay_matches_scipy() {
    let doc = golden("savgol");
    for (n, case) in doc
        .get("cases")
        .and_then(Value::as_arr)
        .expect("cases")
        .iter()
        .enumerate()
    {
        let s = sample(field(case, "x"), field(case, "y"));
        let p = format!(
            "{{\"window\":{},\"polyorder\":{},\"deriv\":{}}}",
            scalar(case, "window"),
            scalar(case, "polyorder"),
            scalar(case, "deriv")
        );
        let r = savitzky_golay::apply(&s, &p).expect("savgol");
        assert_parity(
            &r.y,
            &field(case, "expected"),
            &format!("savgol case {n} {p}"),
        );
    }
}

#[test]
fn grid_matches_numpy_interp() {
    let doc = golden("griglia");
    for (n, case) in doc
        .get("cases")
        .and_then(Value::as_arr)
        .expect("cases")
        .iter()
        .enumerate()
    {
        let s = sample(field(case, "x"), field(case, "y"));
        let p = format!(
            "{{\"from_cm1\":{},\"to_cm1\":{},\"step_cm1\":{}}}",
            scalar(case, "from_cm1"),
            scalar(case, "to_cm1"),
            scalar(case, "step_cm1")
        );
        let r = griglia::apply(&s, &p).expect("grid");
        assert_parity(&r.y, &field(case, "expected"), &format!("grid case {n}"));
        assert!(r.wavenumber_cm1.windows(2).all(|w| w[1] > w[0]));
    }
}

#[test]
fn default_grid_has_1576_points() {
    let s = generate(&Params::demo());
    let r = griglia::apply(&s, "{}").expect("grid");
    assert_eq!(
        (r.len(), r.wavenumber_cm1[0], r.wavenumber_cm1[1575]),
        (1576, 650.0, 3800.0)
    );
}

#[test]
fn transmittance_matches_formula_and_round_trips() {
    let doc = golden("trasmittanza");
    let t = field(&doc, "percent");
    let s = Spectrum::new(
        Role::Sample,
        YUnit::Transmittance,
        (0..t.len()).map(|i| 1000.0 + i as f64).collect(),
        t.clone(),
    );
    let a = trasmittanza::to_absorbance(&s, "{}").expect("A");
    assert_eq!(a.y_unit, YUnit::Absorbance);
    assert_parity(&a.y, &field(&doc, "expected"), "absorbance");
    let back = trasmittanza::to_transmittance(&a, "{}").expect("T");
    for (b, o) in back.y.iter().zip(&t) {
        if *o > 0.0 {
            assert!((b - o).abs() <= 1e-12 * o, "round trip {o} -> {b}");
        } else {
            assert!(b.is_nan());
        }
    }
    assert_eq!(back.history.len(), 2);
    assert_eq!(s.history.len(), 0, "the input is never modified");
}

#[test]
fn fraction_transmittance_and_noop_on_absorbance() {
    let s = Spectrum::new(
        Role::Reference,
        YUnit::Transmittance,
        vec![1.0, 2.0],
        vec![0.1, 1.0],
    );
    let a = trasmittanza::to_absorbance(&s, r#"{"percent":false}"#).expect("A");
    assert_eq!(a.role, Role::Reference);
    assert!((a.y[0] - 1.0).abs() < 1e-15 && a.y[1].abs() < 1e-15);
    let same = trasmittanza::to_absorbance(&a, "{}").expect("noop");
    assert_eq!(same, a);
}

#[test]
fn normalisations_match_reference() {
    let doc = golden("normalizza");
    let s = sample(field(&doc, "x"), field(&doc, "y"));
    for m in ["vettore", "snv", "minmax"] {
        let r = normalizza::apply(&s, &format!("{{\"method\":\"{m}\"}}")).expect(m);
        assert_parity(&r.y, &field(&doc, m), m);
    }
    let flat = sample(vec![1.0, 2.0, 3.0], vec![0.5; 3]);
    assert_eq!(
        normalizza::apply(&flat, "{}").unwrap_err().error_key,
        "passi.spettro_costante"
    );
    assert_eq!(
        normalizza::apply(&s, r#"{"method":"area"}"#)
            .unwrap_err()
            .error_key,
        "passi.parametro_non_valido"
    );
}

fn one_band(center: f64, step: f64) -> Params {
    let mut p = Params::demo();
    p.from_cm1 = 3000.0;
    p.to_cm1 = 800.0;
    p.step_cm1 = step;
    p.bands = vec![Band {
        center_cm1: center,
        half_width_cm1: 12.0,
        height: 0.8,
    }];
    p.baseline_offset = 0.0;
    p.baseline_slope = 0.0;
    p.noise = 0.0;
    p
}

#[test]
fn grid_keeps_the_known_bands() {
    let mut p = one_band(1700.0, 1.0);
    p.bands.push(Band {
        center_cm1: 1100.0,
        half_width_cm1: 8.0,
        height: 0.5,
    });
    let r = griglia::apply(&generate(&p), "{}").expect("grid");
    for (x, y) in r.wavenumber_cm1.iter().zip(&r.y) {
        if *x >= 800.0 && *x <= 3000.0 {
            assert!((y - true_value(&p, *x)).abs() < 1e-12, "at {x}");
        } else {
            assert!(y.is_nan(), "outside the measured range {x} must be absent");
        }
    }
    let top =
        r.y.iter()
            .cloned()
            .filter(|v| v.is_finite())
            .fold(f64::MIN, f64::max);
    let at = r.y.iter().position(|v| *v == top).expect("max");
    assert_eq!(r.wavenumber_cm1[at], 1700.0);
}

#[test]
fn derivative_is_null_at_the_centre_of_a_symmetric_band() {
    let r = griglia::apply(&generate(&one_band(1700.0, 2.0)), "{}").expect("grid");
    let d = savitzky_golay::apply(&r, "{}").expect("derivative");
    let c = r
        .wavenumber_cm1
        .iter()
        .position(|x| *x == 1700.0)
        .expect("centre");
    assert!(d.y[c].abs() < 1e-12, "centre {}", d.y[c]);
    assert!(
        d.y[c - 3] > 1e-4 && d.y[c + 3] < -1e-4,
        "rising before, falling after"
    );
    let smooth = savitzky_golay::apply(&r, r#"{"deriv":0}"#).expect("smooth");
    assert!(
        smooth.y[c] > 0.5 && smooth.y[c] <= 0.8,
        "smoothing lowers a narrow peak a little: {}",
        smooth.y[c]
    );
}

#[test]
fn mask_removes_the_interval_only() {
    let r = griglia::apply(&generate(&Params::demo()), "{}").expect("grid");
    let m = maschera::apply(&r, r#"{"intervals_cm1":[[1900,2400],[3000,3100]]}"#).expect("mask");
    for (i, x) in r.wavenumber_cm1.iter().enumerate() {
        let inside = (1900.0..=2400.0).contains(x) || (3000.0..=3100.0).contains(x);
        assert_eq!(m.y[i].is_nan(), inside, "{x}");
        if !inside {
            assert_eq!(m.y[i], r.y[i]);
        }
    }
    assert_eq!(
        maschera::apply(&r, r#"{"intervals_cm1":[[5,1]]}"#)
            .unwrap_err()
            .error_key,
        "passi.parametro_non_valido"
    );
}

#[test]
fn chain_confronto_v1_equals_the_steps_one_by_one() {
    let p = Params::demo();
    let a = generate(&p);
    let t = Spectrum::new(
        Role::Sample,
        YUnit::Transmittance,
        a.wavenumber_cm1.clone(),
        a.y.iter().map(|v| 100.0 * 10f64.powf(-v)).collect(),
    );
    let chained = run(&t, CONFRONTO_V1).expect("chain");
    let ab = trasmittanza::to_absorbance(&t, "{}").unwrap();
    let step = maschera::apply(
        &savitzky_golay::apply(&griglia::apply(&ab, "{}").unwrap(), "{}").unwrap(),
        "{}",
    )
    .unwrap();
    assert_parity(&chained.y, &step.y, "chain");
    assert_eq!(chained.history.len(), 4);
    assert!(chained.history[1].starts_with("griglia/1 {"));
    assert_eq!(chained.len(), 1576);
    let again = run(&t, CONFRONTO_V1).unwrap();
    assert_eq!(
        again.history, chained.history,
        "the history alone replays the chain"
    );
    assert_eq!(t.history.len(), 0);
}

#[test]
fn bad_input_gives_translatable_errors() {
    let s = sample((0..40).map(|i| i as f64 * 2.0).collect(), vec![1.0; 40]);
    let key = |r: Result<Spectrum, ftir_core::error::EngineError>| r.unwrap_err().error_key;
    assert_eq!(
        key(savitzky_golay::apply(&s, r#"{"window":14}"#)),
        "passi.parametro_non_valido"
    );
    assert_eq!(
        key(savitzky_golay::apply(&s, r#"{"window":5,"polyorder":5}"#)),
        "passi.parametro_non_valido"
    );
    assert_eq!(
        key(savitzky_golay::apply(&s, r#"{"deriv":3}"#)),
        "passi.parametro_non_valido"
    );
    assert_eq!(
        key(savitzky_golay::apply(&s, r#"{"foo":1}"#)),
        "passi.parametro_sconosciuto"
    );
    assert_eq!(
        key(savitzky_golay::apply(&s, "[1]")),
        "passi.parametri_non_oggetto"
    );
    assert_eq!(
        key(griglia::apply(&s, r#"{"step_cm1":0}"#)),
        "passi.parametro_non_valido"
    );
    assert_eq!(
        key(griglia::apply(&s, r#"{"step_cm1":1e-9}"#)),
        "passi.troppi_punti"
    );
    let mut x: Vec<f64> = s.wavenumber_cm1.clone();
    x[20] += 0.5;
    assert_eq!(
        key(savitzky_golay::apply(&sample(x, vec![1.0; 40]), "{}")),
        "passi.griglia_non_uniforme"
    );
    assert_eq!(
        key(run(&s, r#"{"schema":"catene/2","steps":[]}"#)),
        "passi.catena_non_valida"
    );
    assert_eq!(
        key(run(&s, r#"{"schema":"catene/1","steps":[{"id":"x/1"}]}"#)),
        "passi.passo_sconosciuto"
    );
    assert_eq!(key(run(&s, "not json")), "passi.json_non_valido");
}

#[test]
fn short_runs_and_absent_points_are_handled() {
    let mut y = vec![1.0; 60];
    y[30] = f64::NAN;
    let s = sample((0..60).map(|i| 1000.0 + 2.0 * i as f64).collect(), y);
    let d = savitzky_golay::apply(&s, r#"{"window":15,"deriv":0}"#).expect("runs");
    assert!(d.y[30].is_nan());
    assert!(d.y[..30]
        .iter()
        .chain(&d.y[31..])
        .all(|v| (v - 1.0).abs() < 1e-12));
    let short = savitzky_golay::apply(&s, r#"{"window":31}"#).expect("short runs");
    assert!(
        short.y.iter().all(|v| v.is_nan()),
        "runs shorter than the window are absent"
    );
}
