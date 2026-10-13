//! Mixture analysis on real library spectra: a fixed subset of the private bench (`bench_mix.py`, seed 11) must give the
//! same components as the Python rule. The fixture `studio/miscele/miscele_reale_seme11.json` lives in the private
//! repository (made by `tools/miscele_riferimento_reale.py`); without `CHECKIR_DATA` or without the file the test is skipped.
mod common;
use ftir_core::miscele::dati::{Cuts, Thresholds};
use ftir_core::miscele::{analyze, Candidate};
use ftir_core::passi::json::{parse, Value};
use ftir_core::peaks;
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use std::collections::BTreeSet;

fn numbers(v: &Value) -> Vec<f64> {
    v.as_arr()
        .expect("array")
        .iter()
        .map(|n| n.as_f64().unwrap_or(f64::NAN))
        .collect()
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).expect(key).to_string()
}

fn indices(v: &Value, key: &str) -> Vec<usize> {
    numbers(v.get(key).expect(key))
        .iter()
        .map(|n| *n as usize)
        .collect()
}

#[test]
fn chosen_components_match_the_python_rule_on_the_fixed_subset() {
    let Some(dir) = common::private_dir() else {
        eprintln!("skip: CHECKIR_DATA not set");
        return;
    };
    let path = dir.join("studio/miscele/miscele_reale_seme11.json");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        eprintln!("skip: {} not found", path.display());
        return;
    };
    let doc = parse(&raw).expect("fixture json");
    let axis = numbers(doc.get("wavenumber_cm1").expect("axis"));
    let library = doc.get("library").and_then(Value::as_arr).expect("library");
    let spectrum = |role, y: Vec<f64>| Spectrum::new(role, YUnit::Absorbance, axis.clone(), y);
    let (th, pk) = (
        Thresholds::embedded().expect("thresholds"),
        peaks::Thresholds::embedded().expect("peaks thresholds"),
    );
    let mut mismatches = Vec::new();
    let mixtures = doc
        .get("mixtures")
        .and_then(Value::as_arr)
        .expect("mixtures");
    for m in mixtures {
        let cand = indices(m, "candidates");
        let cuts_idx: BTreeSet<usize> = indices(m, "cut_candidates").into_iter().collect();
        let pool: Vec<Candidate> = cand
            .iter()
            .map(|&i| Candidate {
                id: text(&library[i], "id"),
                substance: Some(text(&library[i], "substance")),
                name: text(&library[i], "name"),
                library: text(&library[i], "library"),
                spectrum: spectrum(Role::Reference, numbers(library[i].get("y").expect("y"))),
            })
            .collect();
        let names: Vec<String> = cuts_idx
            .iter()
            .map(|&i| format!("\"{}\"", text(&library[i], "substance").to_lowercase()))
            .collect();
        let cuts_json = format!(
            "{{\"schema\":\"tagli/1\",\"version\":1,\"status\":\"draft\",\"cuts\":[{{\"id\":\"bench\",\"names\":[{}]}}]}}",
            names.join(",")
        );
        let cuts = Cuts::parse(&cuts_json).expect("cuts");
        let sample = spectrum(Role::Sample, numbers(m.get("sample_y").expect("sample")));
        let out = analyze(&sample, &pool, &th, &cuts, &pk).expect("analysis");
        let got: BTreeSet<usize> = out
            .components
            .iter()
            .filter(|c| c.variant_of.is_none())
            .map(|c| cand[c.candidate])
            .collect();
        let expected: BTreeSet<usize> = m
            .get("expected")
            .and_then(Value::as_arr)
            .expect("expected")
            .iter()
            .map(|e| e.get("candidate").and_then(Value::as_f64).expect("index") as usize)
            .collect();
        if got != expected {
            mismatches.push(format!(
                "{}: rust {got:?}, python {expected:?}",
                text(m, "label")
            ));
        }
    }
    assert!(
        mismatches.is_empty(),
        "mismatches:\n{}",
        mismatches.join("\n")
    );
}
