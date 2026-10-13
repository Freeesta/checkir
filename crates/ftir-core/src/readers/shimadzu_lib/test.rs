#![allow(clippy::unwrap_used, clippy::indexing_slicing)]
use super::*;
use crate::synthetic_shimadzu_lib as syn;

fn limits() -> Limits {
    Limits::STANDARD
}

#[test]
fn reads_twenty_entries_without_names() {
    let entries = syn::entries(20);
    let bytes = syn::l01(&entries);
    let doc = open(&bytes, &limits(), &Options::default()).unwrap();
    assert_eq!(doc.spectra.len(), 20);
    for (s, e) in doc.spectra.iter().zip(&entries) {
        let want: Vec<f64> = e.values.iter().map(|&b| f64::from(b)).collect();
        assert_eq!(s.y.values, want);
        assert_eq!(s.x.order, Order::Ascending);
        assert_eq!(
            s.x.values,
            XValues::Regular {
                first: syn::LOW,
                last: syn::HIGH,
                n: syn::points()
            }
        );
        assert_eq!(s.role, Role::Reference);
        assert!(s.measurement.title.is_none());
    }
    let w = &doc.warnings[0];
    assert_eq!((w.key, w.params[0].1.as_str()), ("reader.scale_lost", "20"));
}

#[test]
fn names_come_from_the_nam_file() {
    let entries = syn::entries(20);
    let doc = open_named(&syn::l01(&entries), Some(&syn::nam(&entries)), &limits()).unwrap();
    for (k, s) in doc.spectra.iter().enumerate() {
        let t = s.measurement.title.as_ref().unwrap();
        assert_eq!(t.value, format!("Substance {}", k + 1));
        assert!(s.fields[t.field].identity);
        assert!(s
            .fields
            .iter()
            .any(|f| f.key == "DESCRIPTION" && f.identity));
    }
}

#[test]
fn detect_needs_the_signature_and_a_plausible_axis() {
    let bytes = syn::l01(&syn::entries(2));
    assert_eq!(detect("a.L01", &bytes[..72]), Confidence::Certain);
    assert_eq!(detect("a.bin", &bytes[..72]), Confidence::Likely);
    assert_eq!(detect("a.L01", b"IRS\0"), Confidence::No);
    let mut bad = bytes[..72].to_vec();
    bad[24..32].copy_from_slice(&0.0f64.to_le_bytes());
    assert_eq!(detect("a.L01", &bad), Confidence::No);
}

#[test]
fn damaged_files_are_errors_not_panics() {
    let bytes = syn::l01(&syn::entries(3));
    let key = |b: &[u8]| open(b, &limits(), &Options::default()).unwrap_err().key;
    assert_eq!(
        key(&bytes[..bytes.len() - 1]),
        "reader.shimadzu_lib.bad_size"
    );
    assert_eq!(key(&bytes[..72]), "reader.shimadzu_lib.bad_size");
    assert_eq!(key(b"hello"), "reader.shimadzu_lib.not_lib");
    for cut in 0..bytes.len().min(400) {
        let _ = open(&bytes[..cut], &limits(), &Options::default());
    }
    let few = Limits {
        max_spectra: 2,
        ..limits()
    };
    let e = open(&bytes, &few, &Options::default()).unwrap_err();
    assert_eq!(e.key, "reader.limit_exceeded");
    let few_points = Limits {
        max_points: 10,
        ..limits()
    };
    let e = open(&bytes, &few_points, &Options::default()).unwrap_err();
    assert_eq!(e.key, "reader.limit_exceeded");
}

#[test]
fn a_broken_nam_is_an_error() {
    let entries = syn::entries(2);
    let e = open_named(&syn::l01(&entries), Some(b"not a db"), &limits()).unwrap_err();
    assert!(e.key.starts_with("reader.ispd.bdb_"), "{}", e.key);
}
