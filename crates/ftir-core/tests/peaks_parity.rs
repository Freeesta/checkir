//! Parity of the peak finder with `scipy.signal.find_peaks`, `peak_prominences` and `peak_widths`
//! (`tests/fixture/peaks/parity.json`, made by hand with `tools/picchi_riferimento.py`, outside the mandatory CI).
use ftir_core::passi::json::{parse, Value};
use ftir_core::peaks::find::{find_peaks, prominence};
use ftir_core::peaks::{scan::scan_found, Thresholds};

fn nums(v: &Value, key: &str) -> Vec<f64> {
    v.get(key)
        .and_then(Value::as_arr)
        .unwrap_or_else(|| panic!("missing {key}"))
        .iter()
        .map(|n| n.as_f64().expect("number"))
        .collect()
}

fn scalar(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("missing {key}"))
}

fn close(got: f64, want: f64, what: &str) {
    assert!(
        (got - want).abs() <= 1e-9 * want.abs().max(1.0),
        "{what}: got {got} want {want}"
    );
}

fn same(got: &[f64], want: &[f64], what: &str) {
    assert_eq!(got.len(), want.len(), "{what}: length");
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
        close(*g, *w, &format!("{what}[{i}]"));
    }
}

fn fixture() -> Value {
    let path = format!(
        "{}/tests/fixture/peaks/parity.json",
        env!("CARGO_MANIFEST_DIR")
    );
    parse(&std::fs::read_to_string(path).expect("fixture")).expect("json")
}

#[test]
fn indices_prominences_and_widths_match_scipy() {
    let doc = fixture();
    let cases = doc.get("cases").and_then(Value::as_arr).expect("cases");
    assert!(cases.len() >= 6);
    for c in cases {
        let name = c.get("name").and_then(Value::as_str).expect("name");
        let y = nums(c, "y");
        let want = c.get("expected").expect("expected");
        let (distance, rel) = (scalar(c, "distance") as usize, scalar(c, "rel_height"));
        let (min_prom, local_min) = (scalar(c, "min_prominence"), scalar(c, "local_min"));
        let wlen = scalar(c, "wlen") as usize;
        let found: Vec<_> = find_peaks(&y, min_prom, distance, rel)
            .into_iter()
            .filter(|f| prominence(&y, f.index, Some(wlen)).0 >= local_min)
            .collect();
        let idx: Vec<f64> = found.iter().map(|f| f.index as f64).collect();
        assert_eq!(idx, nums(want, "indices"), "{name}: indices");
        same(
            &found.iter().map(|f| f.prominence).collect::<Vec<_>>(),
            &nums(want, "prominences"),
            name,
        );
        same(
            &found.iter().map(|f| f.width).collect::<Vec<_>>(),
            &nums(want, "widths"),
            name,
        );
        same(
            &found.iter().map(|f| f.width_height).collect::<Vec<_>>(),
            &nums(want, "width_heights"),
            name,
        );
        same(
            &found.iter().map(|f| f.left_ip).collect::<Vec<_>>(),
            &nums(want, "left_ips"),
            name,
        );
        same(
            &found.iter().map(|f| f.right_ip).collect::<Vec<_>>(),
            &nums(want, "right_ips"),
            name,
        );
        let bases: Vec<f64> = found.iter().map(|f| f.left_base as f64).collect();
        assert_eq!(bases, nums(want, "left_bases"), "{name}: left bases");
    }
}

#[test]
fn the_scan_of_a_run_applies_the_same_two_rules_with_the_thresholds_file() {
    let t = Thresholds::embedded().expect("thresholds");
    let doc = fixture();
    let cases = doc.get("cases").and_then(Value::as_arr).expect("cases");
    for c in cases
        .iter()
        .filter(|c| scalar(c, "distance") == 2.0 && scalar(c, "rel_height") == 0.5)
    {
        let y = nums(c, "y");
        let x: Vec<f64> = (0..y.len()).map(|i| 650.0 + 2.0 * i as f64).collect();
        let found = scan_found(
            &x,
            &y,
            scalar(c, "min_prominence"),
            scalar(c, "local_min"),
            &t,
        );
        let idx: Vec<f64> = found.iter().map(|f| f.index as f64).collect();
        let name = c.get("name").and_then(Value::as_str).expect("name");
        assert_eq!(
            idx,
            nums(c.get("expected").expect("expected"), "indices"),
            "{name}"
        );
    }
}
