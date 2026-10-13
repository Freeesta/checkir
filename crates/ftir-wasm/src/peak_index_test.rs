//! Tests of the peak index bridge.

#[test]
fn peak_index_round_trips_and_reports_errors_as_data() {
    let axis: Vec<f64> = (0..1576).map(|i| 650.0 + 2.0 * f64::from(i)).collect();
    let band = |c: f64| {
        axis.iter()
            .map(|x| 1.0 / (1.0 + ((x - c) / 8.0).powi(2)))
            .collect::<Vec<f64>>()
    };
    assert!(crate::peak_index::peak_index_begin("t", "v1").contains("true"));
    let a = crate::peak_index::peak_index_add("t", "absorbance", &axis, &band(1700.0));
    assert!(a.contains("\"usable\":true"), "{a}");
    let bad = crate::peak_index::peak_index_add("t", "absorbance", &axis[..3], &[1.0]);
    assert!(bad.contains("\"error_key\""), "{bad}");
    assert!(crate::peak_index::peak_index_finish("t").contains("\"schema\":\"peak-index/1\""));
    let hit = crate::peak_index::peak_index_query("t", "{\"peaks\":[{\"position_cm1\":1702}]}");
    assert!(hit.contains("\"total\":1"), "{hit}");
    let bytes = crate::peak_index::peak_index_export("t");
    crate::peak_index::peak_index_remove("t");
    assert!(
        crate::peak_index::peak_index_query("t", "{\"peaks\":[{\"position_cm1\":1}]}")
            .contains("peak_index.missing")
    );
    assert!(crate::peak_index::peak_index_import("t", "v1", &bytes).contains("true"));
    assert!(crate::peak_index::peak_index_import("t", "v2", &bytes).contains("peak_index.obsolete"));
    assert!(crate::peak_index::peak_index_query("t", "{}").contains("peak_index.query_invalid"));
}
