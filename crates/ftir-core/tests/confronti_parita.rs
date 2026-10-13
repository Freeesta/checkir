//! Library comparison: parity with the NumPy/SciPy/pybaselines reference (golden/confronti). The pairwise functions are
//! f64 and must agree to 1e-9; the search over the f32 matrix must agree to 1e-6 (storage precision).
use ftir_core::confronti::asls::{baseline, DEFAULT};
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::pearson::{pearson, region_mask, score_derivative, score_spectrum};
use ftir_core::confronti::prepare;
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::passi::json::{parse, Value};
use ftir_core::spectrum::{Role, Spectrum, YUnit};

fn golden(name: &str) -> Value {
    let path = format!(
        "{}/tests/golden/confronti/{name}.json",
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

fn items(v: &Value) -> &[(String, Value)] {
    match v {
        Value::Obj(o) => o,
        _ => panic!("object expected"),
    }
}

fn field<'a>(v: &'a Value, key: &str) -> &'a Value {
    v.get(key).unwrap_or_else(|| panic!("missing {key}"))
}

#[test]
fn asls_matches_pybaselines() {
    let g = golden("asls");
    for case in field(&g, "cases").as_arr().expect("cases") {
        let (y, want) = (nums(field(case, "y")), nums(field(case, "expected")));
        let got = baseline(&y, &DEFAULT).expect("baseline");
        let scale = want.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let worst = got
            .iter()
            .zip(&want)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f64::max);
        // The system has condition number ~1e10 (lam = 1e7): two correct solvers differ by ~1e-8 of the scale; the scores built
        // on the baseline agree to 1e-9 (see the next test).
        assert!(
            worst <= 1e-7 * scale,
            "worst difference {worst:e} (scale {scale})"
        );
    }
}

fn spectrum(x: &[f64], y: Vec<f64>) -> Spectrum {
    Spectrum::new(Role::Sample, YUnit::Absorbance, x.to_vec(), y)
}

fn build_index(lib: &[Spectrum]) -> Index {
    let mut cache = LibraryCache::new("golden", "1");
    for (i, s) in lib.iter().enumerate() {
        let entry = LibEntry {
            id: format!("s{i}"),
            substance: Some(format!("sub{i}")),
            inchikey: None,
            display_name: format!("S{i}"),
            form: "base".into(),
            classes: Vec::new(),
        };
        cache.add(entry, s).expect("add");
    }
    Index::new(vec![cache])
}

fn ranges_of(exp: &Value) -> Vec<(f64, f64)> {
    field(exp, "ranges")
        .as_arr()
        .expect("ranges")
        .iter()
        .map(|r| {
            let r = nums(r);
            (r[0], r[1])
        })
        .collect()
}

#[test]
fn pairwise_scores_match_numpy_and_the_search_agrees_to_storage_precision() {
    let g = golden("libreria");
    let x = nums(field(&g, "x"));
    let lib: Vec<Spectrum> = field(&g, "library")
        .as_arr()
        .expect("library")
        .iter()
        .map(|y| spectrum(&x, nums(y)))
        .collect();
    let query = spectrum(&x, nums(field(&g, "query")));
    let t = Thresholds::embedded().expect("thresholds");
    let index = build_index(&lib);
    let pq = prepare(&query).expect("prepare");
    for (name, exp) in items(field(&g, "expected")) {
        let ranges = ranges_of(exp);
        let (rd, rs) = (
            nums(field(exp, "r_derivative")),
            nums(field(exp, "r_spectrum")),
        );
        let mut sel = vec![false; pq.deriv.len()];
        for (lo, hi) in &ranges {
            let m = region_mask(*lo, *hi);
            sel.iter_mut().zip(m).for_each(|(s, m)| *s |= m);
        }
        for (i, s) in lib.iter().enumerate() {
            let p = prepare(s).expect("prepare");
            let (d, sp) = (
                pearson(&pq.deriv, &p.deriv, Some(&sel)).unwrap(),
                pearson(&pq.spec, &p.spec, Some(&sel)).unwrap(),
            );
            assert!(
                (d - rd[i]).abs() <= 1e-9,
                "{name} derivative row {i}: {d} vs {}",
                rd[i]
            );
            assert!(
                (sp - rs[i]).abs() <= 1e-9,
                "{name} spectrum row {i}: {sp} vs {}",
                rs[i]
            );
            if name == "all" {
                let (a, b) = (
                    score_derivative(&query, s).unwrap(),
                    score_spectrum(&query, s).unwrap(),
                );
                assert!((a - rd[i]).abs() <= 1e-9 && (b - rs[i]).abs() <= 1e-9);
            }
        }
        let opts = parse_options(
            &format!(
                "{{\"ranges\":{}}}",
                Value::Arr(
                    ranges
                        .iter()
                        .map(|(a, b)| Value::Arr(vec![Value::Num(*a), Value::Num(*b)]))
                        .collect()
                )
                .write()
            ),
            &t,
        )
        .unwrap();
        let out = search(&index, &query, &opts, &t).expect("search");
        for c in &out.candidates {
            let i = c.g;
            assert!(
                (c.r_derivative - rd[i]).abs() <= 1e-6,
                "{name} search derivative row {i}"
            );
            assert!(
                (c.r_spectrum - rs[i]).abs() <= 1e-6,
                "{name} search spectrum row {i}"
            );
        }
    }
}
