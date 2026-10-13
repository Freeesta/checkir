//! Tests on the real JCAMP libraries of the private repository: skipped without `CHECKIR_DATA`.
mod common;
use ftir_core::readers::jcamp;
use ftir_core::readers::model::{Background, Limits, Options, Order, Severity, XUnit, YUnit};
use std::collections::BTreeMap;

#[test]
fn all_library_files_open_and_pass_the_audit() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let mut files = Vec::new();
    common::walk(&root.join("Library"), &mut files);
    files.retain(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("dx"))
    });
    assert!(!files.is_empty(), "no .dx files in Library");
    let scarti = common::scarti();
    let mut warn_hist: BTreeMap<String, usize> = BTreeMap::new();
    let mut variants: BTreeMap<String, usize> = BTreeMap::new();
    for p in &files {
        let bytes = std::fs::read(p).expect("read");
        let doc = jcamp::open(&bytes, &Limits::STANDARD, &Options::default())
            .unwrap_or_else(|e| panic!("{}: {e:?}", p.display()));
        assert_eq!(doc.spectra.len(), 1, "{}", p.display());
        let s = &doc.spectra[0];
        let np: usize = s
            .fields
            .iter()
            .find(|f| f.key == "NPOINTS")
            .and_then(|f| f.value.trim().parse().ok())
            .expect("NPOINTS");
        assert_eq!(s.y.values.len(), np, "{}", p.display());
        assert_eq!(s.x.values.len(), np, "{}", p.display());
        assert_eq!(s.y.unit, YUnit::Absorbance);
        assert_eq!(doc.background, Background::NONE, "{}", p.display());
        assert_eq!(s.x.unit, XUnit::Cm1);
        let gaps = common::uncovered(&bytes, &doc, &scarti);
        assert!(gaps.is_empty(), "{}: {gaps:?}", p.display());
        *variants.entry(doc.provenance.variant.clone()).or_default() += 1;
        for w in doc.warnings.iter().chain(s.warnings.iter()) {
            let k = format!("{} {:?}", w.key, w.severity);
            *warn_hist.entry(k).or_default() += 1;
            assert!(
                w.severity == Severity::Info || w.key == "reader.encoding_fallback",
                "{}: unexpected {w:?}",
                p.display()
            );
        }
        let is_pac = doc.provenance.variant.contains("4.24");
        assert_eq!(s.x.order == Order::Descending, is_pac, "{}", p.display());
    }
    eprintln!(
        "files: {}\nvariants: {variants:?}\nwarnings: {warn_hist:?}",
        files.len()
    );
}
