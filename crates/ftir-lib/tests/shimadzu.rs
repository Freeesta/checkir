//! Import of a Shimadzu library through the bridge, on the synthetic generator (no real data).
use ftir_core::synthetic_shimadzu_lib as synth;
use ftir_lib::bridge::{shimadzu_meta_json, shimadzu_standard};
use ftir_lib::manifest::Grid;

#[test]
fn entries_take_names_from_nam_and_keep_the_shape() {
    let entries = synth::entries(3);
    let (l01, nam) = (synth::l01(&entries), synth::nam(&entries));
    let e = shimadzu_standard(&l01, Some(&nam), 1 << 20).expect("read");
    assert_eq!(e.names, ["Substance 1", "Substance 2", "Substance 3"]);
    let points = Grid::STANDARD.points().expect("points");
    assert_eq!(e.values.len(), 3 * points);
    assert_eq!(e.warnings[0].0, "reader.scale_lost");
    let json = shimadzu_meta_json(&e);
    assert!(json.contains(r#""names":["Substance 1""#) && json.contains("reader.scale_lost"));
    // without the names file the entries are unnamed
    let bare = shimadzu_standard(&l01, None, 1 << 20).expect("read");
    assert!(bare.names.iter().all(String::is_empty));
}

#[test]
fn budget_and_wrong_files_are_errors() {
    let entries = synth::entries(2);
    let l01 = synth::l01(&entries);
    let big = shimadzu_standard(&l01, None, 100).unwrap_err();
    assert_eq!(big.error_key, "reader.limit_exceeded");
    assert!(shimadzu_standard(b"nope", None, 1 << 20).is_err());
}
