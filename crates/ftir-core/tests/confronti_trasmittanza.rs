//! A query in %T or in fraction T gives the same first candidate and the same r (±0.01) as the same substance in
//! absorbance; T ≤ 0 is an absent point, never NaN in the result.
use ftir_core::confronti::lettori::{spectrum_in, unit_named};
use ftir_core::confronti::libreria::LibEntry;
use ftir_core::confronti::motore::Motore;
use ftir_core::confronti::opzioni::parse_query;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use ftir_core::synthetic::{generate, Band, Params};

fn make(bands: &[(f64, f64, f64)], seed: u64) -> Spectrum {
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
        baseline_offset: 0.02,
        baseline_slope: 0.03,
        noise: 0.0005,
        seed,
    })
}

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

fn engine() -> Motore {
    let mut m = Motore::new();
    m.begin("lib", "1.0");
    for (id, bands, seed) in [("a", A, 1), ("b", B, 2)] {
        let e = LibEntry {
            id: id.into(),
            substance: Some(id.to_uppercase()),
            inchikey: None,
            display_name: format!("Substance {id}"),
            form: "base".into(),
            classes: Vec::new(),
        };
        m.add("lib", e, &make(bands, seed)).unwrap();
    }
    m
}

fn query(unit: &str, y: &[f64], x: &[f64]) -> String {
    let nums = |v: &[f64]| {
        v.iter()
            .map(|n| {
                if n.is_nan() {
                    "null".into()
                } else {
                    format!("{n:?}")
                }
            })
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        r#"{{"role":"sample","y_unit":"{unit}","wavenumber_cm1":[{}],"y":[{}]}}"#,
        nums(x),
        nums(y)
    )
}

fn first(m: &mut Motore, q: &str) -> (String, f64) {
    let out = m.compare(q, "").expect("compare");
    assert!(!out.contains("NaN"), "NaN in the result");
    let v = parse(&out).unwrap();
    let c = v.get("candidates").and_then(Value::as_arr).unwrap()[0].clone();
    let id = c
        .get("spectrum_id")
        .and_then(Value::as_str)
        .unwrap()
        .to_string();
    (id, c.get("r_derivative").and_then(Value::as_f64).unwrap())
}

#[test]
fn percent_fraction_and_absorbance_agree() {
    let s = make(A, 7);
    let x = &s.wavenumber_cm1;
    let frac: Vec<f64> = s.y.iter().map(|a| 10f64.powf(-a)).collect();
    let pct: Vec<f64> = frac.iter().map(|t| t * 100.0).collect();
    let mut m = engine();
    let (ida, ra) = first(&mut m, &query("absorbance", &s.y, x));
    let (idp, rp) = first(&mut m, &query("transmittance_percent", &pct, x));
    let (idf, rf) = first(&mut m, &query("transmittance_fraction", &frac, x));
    let (idl, rl) = first(&mut m, &query("transmittance", &pct, x));
    assert_eq!((&idp, &idf, &idl), (&ida, &ida, &ida));
    for r in [rp, rf, rl] {
        assert!((r - ra).abs() <= 0.01, "r {r} vs {ra}");
    }
}

#[test]
fn units_convert_in_the_engine() {
    assert_eq!(
        unit_named("transmittance_fraction"),
        Some((YUnit::Transmittance, 100.0))
    );
    assert_eq!(
        unit_named("transmittance_percent"),
        Some((YUnit::Transmittance, 1.0))
    );
    assert_eq!(unit_named("nope"), None);
    let s = spectrum_in(
        Role::Sample,
        "transmittance_fraction",
        vec![1.0, 2.0],
        vec![0.5, f64::NAN],
    );
    assert_eq!(s.y[0], 50.0);
    assert!(s.y[1].is_nan());
    let x: Vec<f64> = (0..6).map(|i| 1000.0 + i as f64).collect();
    let q = query(
        "transmittance_fraction",
        &[0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        &x,
    );
    assert_eq!(parse_query(&q).unwrap().y_unit, YUnit::Transmittance);
    assert!(parse_query(&query("bogus", &[1.0; 6], &x)).is_err());
}

#[test]
fn non_positive_transmittance_is_an_absent_point() {
    let s = make(A, 7);
    let mut pct: Vec<f64> = s.y.iter().map(|a| 100.0 * 10f64.powf(-a)).collect();
    for v in pct.iter_mut().take(20) {
        *v = 0.0;
    }
    pct[30] = -3.0;
    let mut m = engine();
    let (id, r) = first(
        &mut m,
        &query("transmittance_percent", &pct, &s.wavenumber_cm1),
    );
    assert_eq!(id, "a");
    assert!(r.is_finite());
}
