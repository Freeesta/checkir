//! Library packages: round trip, rejection of any changed byte, limits, resampling parity with NumPy, and the
//! package built from `data/` by the same code the builder uses.
use ftir_core::passi::json::{parse, Value};
use ftir_lib::build::{build_one, resample_jcamp, Source};
use ftir_lib::data::Limits;
use ftir_lib::index::Row;
use ftir_lib::manifest::Grid;
use ftir_lib::package::{write_package, Files, Identity, Package};

fn identity() -> Identity {
    Identity {
        name: "test-library".into(),
        version: "1.0.0".into(),
        date: "2026-10-13".into(),
        license: "CC-BY-4.0".into(),
        attribution_it: Some("Libreria di prova".into()),
        attribution_en: "Test library".into(),
        private: false,
    }
}

fn row(id: &str) -> Row {
    Row {
        id: id.into(),
        form: "form-a".into(),
        substance: "sub-a".into(),
        name_it: Some("Sostanza \"A\"".into()),
        name_en: "Substance A".into(),
        classes: vec!["opioids".into(), "stimulant".into()],
        inchikey: Some("AAAAAAAAAAAAAA-BBBBBBBBBB-C".into()),
        quality: "pass".into(),
        provenance_type: "certified_standard".into(),
    }
}

fn small_grid() -> Grid {
    Grid {
        from_cm1: 1000.0,
        to_cm1: 1010.0,
        step_cm1: 2.0,
    }
}

/// Three rows on a six-point grid, one with absent points and special values.
fn sample_files() -> (Files, Vec<Vec<f32>>) {
    let rows = vec![
        vec![0.0, 0.5, 1.0, 0.25, 0.125, 0.0625],
        vec![f32::NAN, f32::NAN, 0.1, 0.2, f32::NAN, -0.5],
        vec![1e-30, -1e30, f32::MIN_POSITIVE, 3.5, 2.5, 1.5],
    ];
    let named = vec![row("a.1"), row("a.2"), row("a.3")]
        .into_iter()
        .zip(rows.clone())
        .collect();
    (
        write_package(&identity(), &small_grid(), named).expect("write"),
        rows,
    )
}

fn open(f: &Files, bytes: &[u8]) -> Result<Package, ftir_core::error::EngineError> {
    Package::open(&f.manifest_json, &f.index_json, bytes, &Limits::STANDARD)
}

#[test]
fn round_trip_keeps_every_bit() {
    let (files, rows) = sample_files();
    let p = open(&files, &files.data_bin).expect("open");
    assert_eq!(p.manifest.n_spectra, 3);
    assert_eq!(p.manifest.grid, small_grid());
    assert_eq!(p.index.len(), 3);
    assert_eq!(
        p.index.first().map(|r| r.name_it.as_deref()),
        Some(Some("Sostanza \"A\""))
    );
    assert_eq!(files.data_bin.len(), 3 * 6 * 4);
    for (i, want) in rows.iter().enumerate() {
        let got = p.matrix.row(i).expect("row");
        let bits = |v: &[f32]| v.iter().map(|x| x.to_bits()).collect::<Vec<_>>();
        assert_eq!(bits(got), bits(want), "row {i}");
    }
    assert_eq!(p.spectrum("a.2").map(<[f32]>::len), Some(6));
    assert!(p.spectrum("missing").is_none());
}

#[test]
fn a_changed_byte_is_rejected() {
    let (files, _) = sample_files();
    for at in 0..files.data_bin.len() {
        let mut bytes = files.data_bin.clone();
        bytes[at] ^= 0x01;
        let e = open(&files, &bytes).expect_err("must be rejected");
        assert_eq!(e.error_key, "library.sha256_mismatch", "byte {at}");
    }
}

#[test]
fn wrong_size_count_and_limits_are_rejected() {
    let (files, _) = sample_files();
    let key =
        |r: Result<Package, ftir_core::error::EngineError>| r.expect_err("rejected").error_key;
    let mut short = files.data_bin.clone();
    short.pop();
    assert_eq!(key(open(&files, &short)), "library.size_mismatch");
    let few = Limits {
        max_bytes: 10,
        max_spectra: 100,
    };
    assert_eq!(
        key(Package::open(
            &files.manifest_json,
            &files.index_json,
            &files.data_bin,
            &few
        )),
        "library.too_large"
    );
    let fewer = Limits {
        max_bytes: 1 << 20,
        max_spectra: 2,
    };
    assert_eq!(
        key(Package::open(
            &files.manifest_json,
            &files.index_json,
            &files.data_bin,
            &fewer
        )),
        "library.too_many_spectra"
    );
    let two_rows = files
        .index_json
        .replace(",{\"id\":\"a.3\"", ",{\"gone\":\"a.3\"");
    assert_eq!(
        key(Package::open(
            &files.manifest_json,
            &two_rows,
            &files.data_bin,
            &Limits::STANDARD
        )),
        "library.index_invalid"
    );
}

#[test]
fn manifest_and_index_errors_name_the_field() {
    let (files, _) = sample_files();
    let params = |e: ftir_core::error::EngineError| e.params;
    let bad_schema = files
        .manifest_json
        .replace("ftir-library/1", "ftir-library/2");
    let e = Package::open(
        &bad_schema,
        &files.index_json,
        &files.data_bin,
        &Limits::STANDARD,
    )
    .expect_err("schema");
    assert_eq!(e.error_key, "library.schema_unknown");
    let no_sha = files.manifest_json.replace("sha256_data", "sha256_x");
    let e = Package::open(
        &no_sha,
        &files.index_json,
        &files.data_bin,
        &Limits::STANDARD,
    )
    .expect_err("sha");
    assert_eq!(
        (e.error_key, params(e)),
        (
            "library.manifest_invalid",
            vec![("field", "sha256_data".to_string())]
        )
    );
    let bad_grid = files
        .manifest_json
        .replace("\"step_cm1\":2", "\"step_cm1\":0");
    let e = Package::open(
        &bad_grid,
        &files.index_json,
        &files.data_bin,
        &Limits::STANDARD,
    )
    .expect_err("grid");
    assert_eq!(e.error_key, "library.manifest_invalid");
    let e = Package::open(
        "not json",
        &files.index_json,
        &files.data_bin,
        &Limits::STANDARD,
    )
    .expect_err("json");
    assert_eq!(e.error_key, "library.manifest_invalid");
    let bad_quality = files.index_json.replacen("\"pass\"", "\"fail\"", 1);
    let e = Package::open(
        &files.manifest_json,
        &bad_quality,
        &files.data_bin,
        &Limits::STANDARD,
    )
    .expect_err("quality");
    assert_eq!(e.error_key, "library.index_invalid");
}

#[test]
fn wrong_row_length_is_refused_when_writing() {
    let e = write_package(&identity(), &small_grid(), vec![(row("a.1"), vec![0.0; 5])])
        .expect_err("length");
    assert_eq!(e.error_key, "library.row_length");
}

#[test]
fn private_flag_round_trips() {
    let mut id = identity();
    id.private = true;
    let f = write_package(&id, &small_grid(), vec![(row("a.1"), vec![0.0; 6])]).expect("write");
    assert!(open(&f, &f.data_bin).expect("open").manifest.private);
}

fn golden() -> Value {
    let path = format!("{}/tests/golden/resample.json", env!("CARGO_MANIFEST_DIR"));
    parse(&std::fs::read_to_string(path).expect("golden file")).expect("golden json")
}

/// Same absent points, every other point within 1e-9 relative to the largest magnitude of the reference.
#[test]
fn resampling_matches_numpy_interp() {
    let g = golden();
    let cases = g.get("cases").and_then(Value::as_arr).expect("cases");
    assert!(cases.len() >= 3);
    for c in cases {
        let name = c.get("name").and_then(Value::as_str).expect("name");
        let jdx = c.get("jdx").and_then(Value::as_str).expect("jdx");
        let want: Vec<f64> = c
            .get("expected")
            .and_then(Value::as_arr)
            .expect("expected")
            .iter()
            .map(|v| v.as_f64().unwrap_or(f64::NAN))
            .collect();
        let got = resample_jcamp(jdx.as_bytes(), &Grid::STANDARD).expect("resample");
        assert_eq!(got.len(), want.len(), "{name}: length");
        let scale = want
            .iter()
            .filter(|v| v.is_finite())
            .fold(0.0_f64, |m, v| m.max(v.abs()));
        let mut absent = 0;
        for (i, (a, b)) in got.iter().zip(&want).enumerate() {
            assert_eq!(a.is_nan(), b.is_nan(), "{name}: absent point at {i}");
            absent += usize::from(a.is_nan());
            if a.is_finite() {
                assert!(
                    (a - b).abs() <= 1e-9 * scale,
                    "{name}: point {i}: {a} vs {b}"
                );
            }
        }
        assert!(
            absent > 0 || name.contains("wide"),
            "{name}: expected absent points"
        );
    }
}

fn data_path(rel: &str) -> String {
    format!(
        "{}/../../data/substances/synthetic-a/{rel}",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn synthetic_source() -> (String, String, Vec<u8>) {
    (
        std::fs::read_to_string(data_path("substance.json")).expect("substance"),
        std::fs::read_to_string(data_path("spectra/synthetic-a-base.checkir.001.json"))
            .expect("spectrum"),
        std::fs::read(data_path("spectra/synthetic-a-base.checkir.001.jdx")).expect("jdx"),
    )
}

#[test]
fn a_spectrum_of_data_becomes_a_row_and_a_package() {
    let (sub, spec, jdx) = synthetic_source();
    let src = Source {
        substance_json: &sub,
        spectrum_json: &spec,
        jdx: &jdx,
    };
    let b = build_one(&src, &Grid::STANDARD).expect("build");
    assert_eq!(b.row.id, "synthetic-a-base.checkir.001");
    assert_eq!(b.row.substance, "synthetic-a");
    assert_eq!(b.row.quality, "pass");
    assert_eq!(
        (b.library_name.as_str(), b.library_version.as_str()),
        ("checkir-community", "0.0.1")
    );
    assert!(b.row.classes.contains(&"others".to_string()));
    assert_eq!(b.values.len(), 1576);
    assert!(
        b.values.iter().all(|v| v.is_finite()),
        "the file covers the whole grid"
    );
    let f = write_package(
        &identity(),
        &Grid::STANDARD,
        vec![(b.row, b.values.clone())],
    )
    .expect("write");
    let p = open(&f, &f.data_bin).expect("open");
    assert_eq!(
        p.spectrum("synthetic-a-base.checkir.001"),
        Some(b.values.as_slice())
    );
}

#[test]
fn a_changed_jcamp_or_a_forbidden_provenance_does_not_enter() {
    let (sub, spec, jdx) = synthetic_source();
    let mut changed = jdx.clone();
    if let Some(b) = changed.iter_mut().rev().find(|b| b.is_ascii_digit()) {
        *b = if *b == b'0' { b'1' } else { b'0' };
    }
    let src = Source {
        substance_json: &sub,
        spectrum_json: &spec,
        jdx: &changed,
    };
    assert_eq!(
        build_one(&src, &Grid::STANDARD).expect_err("sha").error_key,
        "library.spectrum_sha256"
    );
    let unconfirmed = spec.replace("\"certified_standard\"", "\"unconfirmed_sample\"");
    let src = Source {
        substance_json: &sub,
        spectrum_json: &unconfirmed,
        jdx: &jdx,
    };
    assert_eq!(
        build_one(&src, &Grid::STANDARD)
            .expect_err("provenance")
            .error_key,
        "library.provenance_not_allowed"
    );
}
