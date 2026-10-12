//! JCAMP-DX reader against the synthetic fixtures (truth known), the python `jcamp` golden values and the loss audit.
mod common;
use ftir_core::readers::jcamp::{self, meta};
use ftir_core::readers::model::{Document, Limits, Options, Order, Role, XUnit, YUnit};
use ftir_core::synthetic_jcamp::{fixtures, truth_json, Fixture};
use std::path::PathBuf;

fn dir(sub: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join(sub)
}

fn open(f: &Fixture) -> Document {
    jcamp::open(&f.bytes, &Limits::STANDARD, &Options::default())
        .unwrap_or_else(|e| panic!("{}: {e:?}", f.name))
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol * a.abs().max(b.abs()).max(1.0)
}

fn all_warning_keys(d: &Document) -> Vec<&'static str> {
    let mut v: Vec<&'static str> = d
        .warnings
        .iter()
        .chain(d.spectra.iter().flat_map(|s| s.warnings.iter()))
        .map(|w| w.key)
        .collect();
    v.sort_unstable();
    v.dedup();
    v
}

#[test]
fn committed_fixtures_are_current() {
    for f in fixtures() {
        let jdx = std::fs::read(dir("fixtures/jcamp").join(format!("{}.jdx", f.name)))
            .expect("fixture file");
        assert_eq!(
            jdx, f.bytes,
            "{} is out of date: run the gen_jcamp_fixtures example",
            f.name
        );
        let js =
            std::fs::read_to_string(dir("fixtures/jcamp").join(format!("{}.truth.json", f.name)))
                .expect("truth");
        assert_eq!(js, truth_json(&f), "{}", f.name);
    }
}

#[test]
fn reader_finds_the_truth() {
    for f in fixtures() {
        let doc = open(&f);
        assert_eq!(doc.spectra.len(), f.spectra.len(), "{}", f.name);
        for (s, t) in doc.spectra.iter().zip(&f.spectra) {
            assert_eq!(s.x.values.len(), t.x.len(), "{}", f.name);
            for (a, b) in s.x.values.to_vec().iter().zip(&t.x) {
                assert!((a - b).abs() < 1e-4, "{}: x {a} vs {b}", f.name);
            }
            assert_eq!(
                matches!(s.x.values, ftir_core::readers::model::XValues::Explicit(_)),
                t.explicit
            );
            assert_eq!(s.y.values.len(), t.y_int.len(), "{}", f.name);
            for (a, b) in s.y.values.iter().zip(&t.y_int) {
                assert!(
                    close(*a, *b as f64 * t.yfactor, 1e-12),
                    "{}: y {a} vs {b}",
                    f.name
                );
            }
            assert_eq!(s.y.quantum, Some(t.yfactor));
            assert_eq!(s.x.unit, XUnit::Cm1);
            assert_eq!(s.y.unit, YUnit::Absorbance);
        }
        assert_eq!(all_warning_keys(&doc), f.warnings, "{}", f.name);
    }
}

#[test]
fn golden_parity_with_python_jcamp() {
    let mut checked = 0;
    for f in fixtures().iter().filter(|f| f.oracle) {
        let text = std::fs::read_to_string(dir("golden/jcamp").join(format!("{}.json", f.name)))
            .expect("golden");
        let arr = |key: &str| -> Vec<f64> {
            let at = text.find(&format!("\"{key}\": [")).expect(key) + key.len() + 5;
            let end = text[at..].find(']').expect("end") + at;
            text[at..end]
                .split(',')
                .map(|v| v.trim().parse().expect("number"))
                .collect()
        };
        let (gx, gy) = (arr("x"), arr("y"));
        let s = &open(f).spectra[0];
        let (x, y) = (s.x.values.to_vec(), &s.y.values);
        assert_eq!((x.len(), y.len()), (gx.len(), gy.len()), "{}", f.name);
        let ymax = gy.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for i in 0..gx.len() {
            assert!(close(x[i], gx[i], 1e-9), "{} x[{i}]", f.name);
            assert!((y[i] - gy[i]).abs() <= 1e-9 * ymax, "{} y[{i}]", f.name);
        }
        checked += 1;
    }
    assert!(checked >= 4);
}

#[test]
fn audit_covers_every_record() {
    let scarti = common::scarti();
    for f in fixtures() {
        let doc = open(&f);
        let gaps = common::uncovered(&f.bytes, &doc, &scarti);
        assert!(gaps.is_empty(), "{}: {gaps:?}", f.name);
    }
}

#[test]
fn known_labels_match_the_committed_list() {
    let listed = common::list_lines(include_str!("audit/noti_jcamp.txt"));
    let code: Vec<String> = meta::KNOWN.iter().map(|s| s.to_string()).collect();
    assert_eq!(listed, code);
}

fn by_name(name: &str) -> Document {
    let f = fixtures()
        .into_iter()
        .find(|f| f.name == name)
        .expect("fixture");
    open(&f)
}

#[test]
fn forms_axes_and_variants() {
    assert_eq!(
        by_name("pac_descending_rounded").provenance.variant,
        "JCAMP-DX 4.24, form PAC"
    );
    assert_eq!(
        by_name("pac_descending_rounded").spectra[0].x.order,
        Order::Descending
    );
    assert_eq!(
        by_name("affn_ascending").spectra[0].x.order,
        Order::Ascending
    );
    assert_eq!(
        by_name("dif_dup").provenance.variant,
        "JCAMP-DX 4.24, form SQZ+DIF+DUP"
    );
    assert_eq!(by_name("sqz").provenance.variant, "JCAMP-DX 4.24, form SQZ");
    assert_eq!(
        by_name("affn_ascending").provenance.variant,
        "JCAMP-DX 5.01, form AFFN"
    );
}

#[test]
fn bad_check_keeps_the_data_and_warns() {
    let d = by_name("dif_bad_check");
    let w = d.spectra[0]
        .warnings
        .iter()
        .find(|w| w.key == "reader.jcamp.y_check")
        .expect("warning");
    assert!(w.params.iter().any(|(k, _)| *k == "line"));
}

#[test]
fn npoints_mismatch_uses_counted_points() {
    let d = by_name("npoints_wrong");
    assert_eq!(d.spectra[0].y.values.len(), 180);
    assert_eq!(d.spectra[0].x.values.len(), 180);
}

#[test]
fn link_blocks_become_spectra() {
    let d = by_name("link_two_blocks");
    assert_eq!(d.spectra.len(), 2);
    assert_eq!(d.primary, 0);
    assert!(d.fields.iter().any(|f| f.key == "BLOCKS"));
    assert_eq!(d.spectra[1].x.values.len(), 30);
}

#[test]
fn peak_table_is_processed_with_widths_kept() {
    let s = &by_name("peak_table").spectra[0];
    assert_eq!(s.role, Role::Processed);
    assert!(s
        .fields
        .iter()
        .any(|f| f.key == "PEAKWIDTHS" && f.value == "5.5,5.5,5.5,5.5,5.5"));
}

#[test]
fn text_fields_and_identity() {
    let s = &by_name("windows1252").spectra[0];
    assert_eq!(
        s.measurement.sample_name.as_ref().map(|v| v.value.as_str()),
        Some("A\u{B1}B sample")
    );
    let u = by_name("unknown_label");
    let f = u.spectra[0]
        .fields
        .iter()
        .find(|f| f.key == "$PRIVATELABEL")
        .expect("kept");
    assert!(!f.known);
    assert_eq!(f.value, "kept");
    let w = u.spectra[0]
        .warnings
        .iter()
        .find(|w| w.key == "reader.fields_unknown")
        .expect("summary");
    assert_eq!(w.params, vec![("count", "2".to_string())]);
    let o = u.spectra[0]
        .fields
        .iter()
        .find(|f| f.key == "OWNER")
        .expect("owner");
    assert!(o.identity && o.known);
    let m = u.spectra[0]
        .fields
        .iter()
        .find(|f| f.key == "TITLE")
        .expect("title");
    assert_eq!(m.mapped, Some("measurement.title"));
}

#[test]
fn open_is_deterministic_and_has_provenance() {
    let f = &fixtures()[0];
    assert_eq!(open(f), open(f));
    assert_eq!(open(f).provenance.sha256.len(), 64);
    assert_eq!(open(f).provenance.size, f.bytes.len());
}

fn err(bytes: &[u8], limits: &Limits) -> String {
    match jcamp::open(bytes, limits, &Options::default()) {
        Ok(_) => panic!("must fail"),
        Err(e) => e.key.to_string(),
    }
}

#[test]
fn malformed_input_gives_translated_errors() {
    let l = Limits::STANDARD;
    assert_eq!(err(b"", &l), "reader.jcamp.not_jcamp");
    assert_eq!(err(b"hello", &l), "reader.jcamp.not_jcamp");
    assert_eq!(err(b"##TITLE=x\r\n##END=\r\n", &l), "reader.jcamp.no_data");
    assert_eq!(
        err(b"##TITLE=x\r\n##NTUPLES=NMR\r\n##END=\r\n", &l),
        "reader.jcamp.ntuples_unsupported"
    );
    assert_eq!(
        err(
            b"##TITLE=x\r\n##XYDATA=(X++(Y..Y))\r\n1 2 ?\r\n##END=\r\n",
            &l
        ),
        "reader.jcamp.bad_data"
    );
    assert_eq!(
        err(
            b"##TITLE=x\r\n##FIRSTX=abc\r\n##XYDATA=(X++(Y..Y))\r\n1 2 3\r\n##END=\r\n",
            &l
        ),
        "reader.jcamp.bad_number"
    );
    assert_eq!(
        err(
            b"##TITLE=x\r\n##XYDATA=(X++(Y..Y))\r\n1 2 3\r\n##END=\r\n",
            &l
        ),
        "reader.jcamp.axis_missing"
    );
}

#[test]
fn limits_are_enforced() {
    let f = &fixtures()[0];
    let few_points = Limits {
        max_points: 10,
        ..Limits::STANDARD
    };
    assert_eq!(err(&f.bytes, &few_points), "reader.limit_exceeded");
    let few_fields = Limits {
        max_fields: 3,
        ..Limits::STANDARD
    };
    assert_eq!(err(&f.bytes, &few_fields), "reader.limit_exceeded");
    let few_lines = Limits {
        max_header_lines: 3,
        ..Limits::STANDARD
    };
    assert_eq!(err(&f.bytes, &few_lines), "reader.limit_exceeded");
    let short = Limits {
        max_value_len: 5,
        ..Limits::STANDARD
    };
    assert_eq!(
        err(b"##TITLE=a long title\r\n##END=\r\n", &short),
        "reader.limit_exceeded"
    );
    let bomb = b"##TITLE=x\r\n##XYDATA=(X++(Y..Y))\r\n1 A1S99999999999\r\n##END=\r\n";
    assert_eq!(err(bomb, &Limits::STANDARD), "reader.limit_exceeded");
    let one_spectrum = Limits {
        max_spectra: 1,
        ..Limits::STANDARD
    };
    let link = fixtures()
        .into_iter()
        .find(|f| f.name == "link_two_blocks")
        .expect("link");
    assert_eq!(err(&link.bytes, &one_spectrum), "reader.limit_exceeded");
    let shallow = Limits {
        max_chain: 1,
        ..Limits::STANDARD
    };
    assert_eq!(err(&link.bytes, &shallow), "reader.limit_exceeded");
}

#[test]
fn comments_inside_tables_are_kept() {
    let t = b"##TITLE=x\r\n##JCAMP-DX=5.01 $$ vendor\r\n##FIRSTX=1\r\n##LASTX=4\r\n##NPOINTS=4\r\n##XYDATA=(X++(Y..Y))\r\n1 1 2 $$ inline\r\n$$ whole line\r\n3 3 4\r\n##END=\r\n";
    let d = jcamp::open(t, &Limits::STANDARD, &Options::default()).expect("opens");
    assert_eq!(d.spectra[0].y.values, vec![1.0, 2.0, 3.0, 4.0]);
    let comments: Vec<&str> = d.spectra[0]
        .fields
        .iter()
        .filter(|f| f.key == "$$")
        .map(|f| f.value.as_str())
        .collect();
    assert_eq!(comments, vec!["vendor", "inline", "whole line"]);
}

#[test]
fn transmittance_range_decides_the_unit() {
    let mk = |y: &str| {
        format!("##TITLE=x\r\n##XUNITS=1/CM\r\n##YUNITS=TRANSMITTANCE\r\n##FIRSTX=1\r\n##LASTX=3\r\n##XYDATA=(X++(Y..Y))\r\n1 {y}\r\n##END=\r\n")
    };
    let unit = |y: &str| {
        jcamp::open(mk(y).as_bytes(), &Limits::STANDARD, &Options::default())
            .expect("ok")
            .spectra[0]
            .y
            .unit
    };
    assert_eq!(unit("0.5 0.9 1.0"), YUnit::TransmittanceFraction);
    assert_eq!(unit("50 90 100"), YUnit::TransmittancePercent);
    assert_eq!(unit("5000 9000 100"), YUnit::Unknown);
}
