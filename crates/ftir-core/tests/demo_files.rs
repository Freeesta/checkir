//! The DEMO spectra of `data/demo/` are public files: they must open with the readers, carry no identifying text and match
//! their JSON (SHA-256). No private data needed.
use ftir_core::readers::model::{Limits, Options, XUnit, YUnit};
use ftir_core::readers::{jcamp, sha256::sha256_hex};
use std::path::PathBuf;

fn demo_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/demo")
}

fn main_files() -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(demo_dir())
        .expect("data/demo exists")
        .map(|e| e.expect("entry").path())
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            name.ends_with(".jdx") && name.matches('.').count() == 1
        })
        .collect();
    files.sort();
    files
}

#[test]
fn thirteen_demos_open_as_wavenumber_absorbance_spectra() {
    let files = main_files();
    assert_eq!(files.len(), 13, "expected demo-01 … demo-13");
    for p in &files {
        let bytes = std::fs::read(p).expect("read");
        let doc = jcamp::open(&bytes, &Limits::STANDARD, &Options::default())
            .unwrap_or_else(|e| panic!("{}: {e:?}", p.display()));
        let s = doc.spectra.get(doc.primary).expect("a spectrum");
        assert_eq!(s.x.unit, XUnit::Cm1, "{}", p.display());
        assert_eq!(s.y.unit, YUnit::Absorbance, "{}", p.display());
        assert_eq!(s.x.values.len(), 2924, "{}", p.display());
        assert!(s.y.values.iter().cloned().fold(0.0, f64::max) > 0.1);
    }
}

#[test]
fn json_sha256_matches_the_file_and_no_path_or_user_text_is_left() {
    for p in main_files() {
        let text = std::fs::read_to_string(&p).expect("read");
        let meta = std::fs::read_to_string(p.with_extension("json")).expect("json next to it");
        assert!(meta.contains(&sha256_hex(text.as_bytes())), "{}", p.display());
        for bad in [":\\", "/home/", "Users/", "Users\\", "SNO:", "Serial"] {
            assert!(!text.contains(bad) && !meta.contains(bad), "{} has {bad}", p.display());
        }
    }
}
