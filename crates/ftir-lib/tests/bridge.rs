//! The browser entry points: a JCAMP-DX file becomes a row, a set of rows becomes a package that opens again, and
//! a changed byte or a wrong length is refused with a translatable key.
use ftir_core::passi::json::parse;
use ftir_lib::bridge::{build_json, open_json, resample_standard};
use ftir_lib::data::Limits;

const JDX: &[u8] = include_bytes!("../../ftir-core/tests/fixtures/jcamp/affn_ascending.jdx");
const IDENTITY: &str = r#"{"name":"my-library","version":"1","date":"2026-10-13","license":"LicenseRef-private","attribution":{"en":"Mine"},"private":true}"#;
const INDEX: &str = r#"{"schema":"ftir-library-index/1","spectra":[{"id":"p1","form":"private","substance":"p1","names":{"en":"first"},"classes":[],"quality":"pass","provenance_type":"user_import"}]}"#;

fn data_bin(values: &[f32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn member(json: &str, key: &str) -> String {
    let v = parse(json).expect("json");
    v.get(key).expect("member").write()
}

#[test]
fn an_imported_file_builds_a_package_that_opens_again() {
    let values = resample_standard(JDX).expect("resample");
    assert_eq!(values.len(), 1576);
    let built = build_json(IDENTITY, INDEX, &values).expect("build");
    let (manifest, index) = (member(&built, "manifest"), member(&built, "index"));
    let bytes = data_bin(&values);
    let opened = open_json(&manifest, &index, &bytes, &Limits::STANDARD).expect("open");
    assert!(opened.contains("\"private\":true"), "{opened}");
    let mut bad = bytes.clone();
    bad[100] ^= 1;
    let e = open_json(&manifest, &index, &bad, &Limits::STANDARD).expect_err("changed byte");
    assert_eq!(e.error_key, "library.sha256_mismatch");
}

#[test]
fn wrong_length_and_wrong_identity_are_refused() {
    let values = resample_standard(JDX).expect("resample");
    let e = build_json(IDENTITY, INDEX, &values[..10]).expect_err("length");
    assert_eq!(e.error_key, "library.row_length");
    let e = build_json(r#"{"name":"x"}"#, INDEX, &values).expect_err("identity");
    assert_eq!(e.error_key, "library.identity_invalid");
    assert!(resample_standard(b"not a spectrum").is_err());
}
