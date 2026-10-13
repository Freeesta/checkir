//! Tests of the subtraction bridge.

fn band(c: f64, w: f64, h: f64) -> Vec<f64> {
    (0..1576)
        .map(|i| h * (-0.5 * ((650.0 + 2.0 * i as f64 - c) / w).powi(2)).exp())
        .collect()
}

fn data() -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let x: Vec<f64> = (0..1576).map(|i| 650.0 + 2.0 * i as f64).collect();
    let b: Vec<f64> = band(1100.0, 6.0, 0.7)
        .iter()
        .zip(band(2950.0, 10.0, 0.6))
        .map(|(a, c)| a + c)
        .collect();
    let a = band(1700.0, 4.0, 0.15);
    let y = a.iter().zip(&b).map(|(a, b)| a + 0.6 * b).collect();
    (x, y, b)
}

#[test]
fn factor_and_residual_come_back_as_json() {
    let (x, y, b) = data();
    let p = "{\"baseline\":false}";
    let j = super::fattore_proposto("absorbance", &x, &y, "absorbance", &x, &b, p);
    assert!(j.starts_with("{\"k\":0.6"), "{j}");
    assert!(j.contains("\"background\":[") && j.contains("\"points_used\":"));
    let s = super::sottrai(
        "absorbance",
        &x,
        &y,
        "absorbance",
        &x,
        &b,
        "{\"k\":0.6,\"baseline\":false,\"reference_id\":\"B7\",\"library\":\"Lib\"}",
    );
    assert!(s.starts_with("{\"k\":0.6,\"zone_minimum\":"), "{s}");
    assert!(
        s.contains("\"role\":\"residual\"") && s.contains("\"sottratto: B7, Lib, k = 0.60\"]}}")
    );
}

#[test]
fn absent_points_are_null_and_errors_are_translatable() {
    let (x, y, b) = data();
    let short: Vec<f64> = x[..1000].to_vec();
    let s = super::sottrai(
        "absorbance",
        &x,
        &y,
        "absorbance",
        &short,
        &b[..1000],
        "{\"baseline\":false}",
    );
    assert!(
        s.contains("null"),
        "outside the reference range the residual is absent"
    );
    let bad = super::sottrai("absorbance", &x, &y[..10], "absorbance", &x, &b, "{}");
    assert!(
        bad.contains("\"error_key\":\"passi.asse_non_valido\""),
        "{bad}"
    );
    let neg = super::sottrai("absorbance", &x, &y, "absorbance", &x, &b, "{\"k\":-1}");
    assert!(
        neg.contains("\"error_key\":\"passi.parametro_non_valido\""),
        "{neg}"
    );
    let flat = vec![0.0; 1576];
    let f = super::fattore_proposto(
        "absorbance",
        &x,
        &y,
        "absorbance",
        &x,
        &flat,
        "{\"baseline\":false}",
    );
    assert!(
        f.contains("\"error_key\":\"passi.fattore_indeterminato\""),
        "{f}"
    );
}
