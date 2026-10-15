//! Tests of `costruisci.rs`.
use super::{conf_of, copy_package, package_version, LibConf};
use ftir_core::passi::json::parse;
use ftir_lib::index::Row;
use ftir_lib::manifest::{Grid, Manifest};
use ftir_lib::package::{write_package, Identity};
use std::fs;
use std::path::Path;

fn synthetic(dir: &Path, name: &str) {
    let row = Row {
        id: "s1".into(),
        form: "base".into(),
        substance: None,
        name_it: None,
        name_en: "Synthetic".into(),
        classes: vec![],
        inchikey: None,
        quality: "pass".into(),
        provenance_type: "measured".into(),
    };
    let id = Identity {
        name: name.into(),
        version: "1".into(),
        date: "2026-10-13".into(),
        license: "LicenseRef-private".into(),
        attribution_it: None,
        attribution_en: "private".into(),
        terms_it: None,
        terms_en: None,
        private: true,
        sampling: None,
    };
    let values = vec![0.5f32; Grid::STANDARD.points().unwrap()];
    let f = write_package(&id, &Grid::STANDARD, vec![(row, values)]).unwrap();
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("manifest.json"), f.manifest_json).unwrap();
    fs::write(dir.join("index.json"), f.index_json).unwrap();
    fs::write(dir.join("data.bin"), f.data_bin).unwrap();
    fs::write(dir.join("native.bin"), [7u8, 8, 9]).unwrap();
}

fn conf(id: &str, package: &Path) -> LibConf {
    LibConf {
        id: id.into(),
        enabled: true,
        license: "CC-BY-NC-SA-4.0".into(),
        attribution: (Some("it".into()), "en".into()),
        terms: Some((None, "terms".into())),
        package: Some(package.to_path_buf()),
    }
}

#[test]
fn a_package_keeps_its_bytes_and_takes_the_public_texts() {
    let base = std::env::temp_dir().join(format!("checkir-p-{}", std::process::id()));
    let (src, out) = (base.join("src"), base.join("out"));
    synthetic(&src, "syn");
    let (version, n) = copy_package(&out, &conf("syn", &src)).unwrap();
    assert_eq!((version.as_str(), n), ("1", 1));
    for f in ["index.json", "data.bin", "native.bin"] {
        assert_eq!(
            fs::read(src.join(f)).unwrap(),
            fs::read(out.join("syn").join(f)).unwrap()
        );
    }
    let m = Manifest::parse(&fs::read_to_string(out.join("syn/manifest.json")).unwrap()).unwrap();
    assert!(!m.private);
    assert_eq!(m.license, "CC-BY-NC-SA-4.0");
    assert_eq!(m.terms_en.as_deref(), Some("terms"));
    assert!(copy_package(&out, &conf("other", &src)).is_err());
    fs::write(src.join("data.bin"), [0u8; 4]).unwrap();
    assert!(copy_package(&out, &conf("syn", &src)).is_err());
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn a_package_entry_needs_licence_and_attribution() {
    let path = Path::new("librerie.json");
    let no_licence = parse(r#"{"id":"a","package":"librerie/a"}"#).unwrap();
    assert!(conf_of(&no_licence, path).is_err());
    let no_attribution = parse(r#"{"id":"a","package":"librerie/a","license":"X"}"#).unwrap();
    assert!(conf_of(&no_attribution, path).is_err());
    let ok = r#"{"id":"a","package":"librerie/a","license":"X","attribution":{"en":"e"}}"#;
    let conf = conf_of(&parse(ok).unwrap(), path).unwrap();
    assert_eq!(conf.package.as_deref(), Some(Path::new("librerie/a")));
}

fn package(tag: &str, index: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("checkir-v-{}-{tag}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("manifest.json"), "{}").unwrap();
    fs::write(dir.join("index.json"), index).unwrap();
    fs::write(dir.join("data.bin"), [1u8, 2, 3, 4]).unwrap();
    dir
}

#[test]
fn same_files_same_version_one_byte_other_version() {
    let (a, b, c) = (package("a", "[]"), package("b", "[]"), package("c", "[ ]"));
    let v = package_version(&a).unwrap();
    assert_eq!(v.len(), 12);
    assert_eq!(v, package_version(&b).unwrap());
    assert_ne!(v, package_version(&c).unwrap());
    fs::write(a.join("native.bin"), [0u8; 4]).unwrap();
    assert_ne!(v, package_version(&a).unwrap());
    for d in [a, b, c] {
        fs::remove_dir_all(d).unwrap();
    }
}
