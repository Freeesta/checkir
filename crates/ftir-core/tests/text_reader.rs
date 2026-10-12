//! Delimited-text reader: separator and decimal by trial, header, units, ASC, ambiguity and refusal to guess.
use ftir_core::readers::model::{Document, Limits, Options, Order, XUnit, XValues, YUnit};
use ftir_core::readers::text;
use ftir_core::synthetic_text::{demo_columns, render, render_values, Layout};

fn open_with(bytes: &[u8], o: &Options) -> Result<Document, String> {
    text::open(bytes, &Limits::STANDARD, o).map_err(|e| e.key.to_string())
}

fn open(s: &str) -> Document {
    open_with(s.as_bytes(), &Options::default()).unwrap_or_else(|e| panic!("{e}"))
}

fn xs(d: &Document) -> Vec<f64> {
    d.spectra[0].x.values.to_vec()
}

fn warning_keys(d: &Document) -> Vec<&'static str> {
    d.warnings
        .iter()
        .chain(d.spectra.iter().flat_map(|s| s.warnings.iter()))
        .map(|w| w.key)
        .collect()
}

#[test]
fn every_combination_reads_the_same_numbers() {
    let (x, y) = demo_columns(20);
    let reference = open(&render(&x, &[&y], &Layout::default()));
    assert_eq!(xs(&reference), x);
    assert_eq!(reference.spectra[0].y.values, y);
    for (sep, decimal) in [
        ('\t', '.'),
        (';', ','),
        (',', '.'),
        (' ', '.'),
        (' ', ','),
        ('\t', ','),
    ] {
        for newline in ["\r\n", "\n", "\r"] {
            let l = Layout {
                sep,
                decimal,
                header: &[],
                newline,
            };
            let d = open(&render(&x, &[&y], &l));
            assert_eq!(xs(&d), x, "{sep:?} {decimal:?}");
            assert_eq!(d.spectra[0].y.values, y, "{sep:?} {decimal:?}");
        }
    }
}

#[test]
fn comma_decimal_with_semicolon_equals_point_with_comma() {
    let (x, y) = demo_columns(7);
    let a = open(&render(
        &x,
        &[&y],
        &Layout {
            sep: ';',
            decimal: ',',
            ..Layout::default()
        },
    ));
    let b = open(&render(&x, &[&y], &Layout::default()));
    assert_eq!(a.spectra, b.spectra);
    assert_eq!(a.provenance.variant, "separator semicolon, decimal ','");
    assert_eq!(b.provenance.variant, "separator comma, decimal '.'");
}

#[test]
fn header_units_and_column_names() {
    let (x, y) = demo_columns(20);
    let l = Layout {
        header: &["Sample: Mario Rossi", "Wavenumber (cm-1),Abs"],
        ..Layout::default()
    };
    let d = open(&render(&x, &[&y], &l));
    let s = &d.spectra[0];
    assert_eq!(
        (s.x.unit, s.y.unit, s.x.order),
        (XUnit::Cm1, YUnit::Absorbance, Order::Descending)
    );
    assert_eq!(d.fields.len(), 2);
    assert!(d.fields.iter().all(|f| f.identity));
    assert_eq!(d.fields[0].key, "SAMPLE");
    assert_eq!(d.fields[0].value, "Mario Rossi");
    assert_eq!(d.fields[1].mapped, Some("column.names"));
    assert!(!warning_keys(&d).iter().any(|k| k.contains("unit")));
}

#[test]
fn unknown_units_get_a_hint_never_a_guess() {
    let x: Vec<f64> = (0..50).map(|i| 4000.0 - 20.0 * f64::from(i)).collect();
    let pct: Vec<f64> = (0..50).map(|i| 95.0 - f64::from(i % 7)).collect();
    let d = open(&render(&x, &[&pct], &Layout::default()));
    assert_eq!(d.spectra[0].y.unit, YUnit::Unknown);
    assert!(warning_keys(&d).contains(&"reader.text.yunit_hint_percent_t"));
    assert_eq!(d.spectra[0].x.unit, XUnit::Points);
    assert!(warning_keys(&d).contains(&"reader.text.xunit_hint_cm1"));
    let abs: Vec<f64> = (0..50).map(|i| 0.1 + 0.01 * f64::from(i % 5)).collect();
    let d = open(&render(&x, &[&abs], &Layout::default()));
    assert!(warning_keys(&d).contains(&"reader.text.yunit_hint_absorbance"));
}

#[test]
fn extra_columns_are_extra_spectra() {
    let (x, y) = demo_columns(20);
    let y2: Vec<f64> = y.iter().map(|v| v * 2.0).collect();
    let d = open(&render(&x, &[&y, &y2], &Layout::default()));
    assert_eq!(d.spectra.len(), 2);
    assert_eq!(d.spectra[1].y.values[3], y2[3]);
    assert!(warning_keys(&d).contains(&"reader.text.extra_columns"));
}

#[test]
fn ambiguity_is_refused_and_resolved_by_options() {
    let t = "400,1\n401,2\n402,3\n403,5\n";
    let e =
        text::open(t.as_bytes(), &Limits::STANDARD, &Options::default()).expect_err("ambiguous");
    assert_eq!(e.key, "reader.text.ambiguous");
    assert!(e
        .params
        .iter()
        .any(|(k, v)| *k == "alternatives" && v.contains("comma/.")));
    let o = Options {
        separator: Some(','),
        decimal: Some('.'),
    };
    let d = open_with(t.as_bytes(), &o).expect("forced");
    assert_eq!(xs(&d), vec![400.0, 401.0, 402.0, 403.0]);
    assert_eq!(d.spectra[0].y.values, vec![1.0, 2.0, 3.0, 5.0]);
}

#[test]
fn x_must_be_monotonic() {
    assert_eq!(
        open_with(b"1,5\n3,6\n2,7\n4,8.5\n", &Options::default()).unwrap_err(),
        "reader.text.not_monotonic"
    );
}

#[test]
fn asc_needs_the_axis_in_the_header() {
    let (_, y) = demo_columns(200);
    let ok = render_values(
        &y,
        &[
            "FIRSTX: 4000",
            "LASTX: 400",
            &format!("NPOINTS: {}", y.len()),
        ],
        "\r\n",
    );
    let d = open(&ok);
    assert_eq!(d.provenance.variant, "separator tab, decimal '.', y only");
    let s = &d.spectra[0];
    assert_eq!(
        s.x.values,
        XValues::Regular {
            first: 4000.0,
            last: 400.0,
            n: y.len()
        }
    );
    assert_eq!(s.x.order, Order::Descending);
    assert_eq!(s.y.values, y);
    let missing = render_values(&y, &["some header"], "\n");
    assert_eq!(
        open_with(missing.as_bytes(), &Options::default()).unwrap_err(),
        "reader.asc.axis_missing"
    );
    let bad = render_values(&y, &["FIRSTX: 4000", "LASTX: 400", "NPOINTS: 99"], "\n");
    assert!(warning_keys(&open(&bad)).contains(&"reader.text.npoints_mismatch"));
}

#[test]
fn bom_blank_lines_and_stray_lines() {
    let (x, y) = demo_columns(5);
    let mut body = render(
        &x,
        &[&y],
        &Layout {
            header: &["Wavenumber,Abs", ""],
            ..Layout::default()
        },
    );
    body.push_str("\r\n# exported by test\r\n");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(body.as_bytes());
    let d = open_with(&bytes, &Options::default()).expect("opens");
    let keys = warning_keys(&d);
    assert!(keys.contains(&"reader.bom_removed") && keys.contains(&"reader.text.rows_skipped"));
    assert!(d
        .fields
        .iter()
        .any(|f| f.key == "(SKIPPED)" && f.value == "# exported by test"));
    assert_eq!(xs(&d), x);
    // Loss audit: every non-blank line is a header field, a skipped line or a data row.
    let non_blank = body.lines().filter(|l| !l.trim().is_empty()).count();
    assert_eq!(d.fields.len() + d.spectra[0].y.values.len(), non_blank);
}

#[test]
fn windows_1252_header_is_decoded_with_a_warning() {
    let mut b = b"Operator: Jos\xE9\n".to_vec();
    b.extend_from_slice(
        render(&[3.0, 2.0, 1.0], &[&[0.1, 0.2, 0.3]], &Layout::default()).as_bytes(),
    );
    let d = open_with(&b, &Options::default()).expect("opens");
    assert!(warning_keys(&d).contains(&"reader.encoding_fallback"));
    assert_eq!(d.fields[0].value, "Jos\u{e9}");
}

#[test]
fn refuses_without_panicking() {
    for t in [
        "",
        "   \n\n",
        "hello world\nsecond line\n",
        "a,b\nc,d\n",
        "1\n",
    ] {
        assert!(
            open_with(t.as_bytes(), &Options::default()).is_err(),
            "{t:?}"
        );
    }
}

#[test]
fn limits_are_enforced() {
    let (x, y) = demo_columns(5);
    let t = render(&x, &[&y], &Layout::default());
    let go = |l: Limits| {
        text::open(t.as_bytes(), &l, &Options::default())
            .expect_err("limit")
            .key
    };
    assert_eq!(
        go(Limits {
            max_bytes: 10,
            ..Limits::STANDARD
        }),
        "reader.limit_exceeded"
    );
    assert_eq!(
        go(Limits {
            max_points: 10,
            ..Limits::STANDARD
        }),
        "reader.limit_exceeded"
    );
    let h = render(
        &x,
        &[&y],
        &Layout {
            header: &["a: 1", "b: 2", "c: 3"],
            ..Layout::default()
        },
    );
    let e = text::open(
        h.as_bytes(),
        &Limits {
            max_header_lines: 2,
            ..Limits::STANDARD
        },
        &Options::default(),
    );
    assert_eq!(e.expect_err("limit").key, "reader.limit_exceeded");
}

#[test]
fn registry_picks_the_text_reader_by_extension() {
    use ftir_core::readers::pick;
    assert_eq!(
        pick("scan.csv", b"4000,0.1\n3990,0.2\n").map(|r| r.id),
        Some("text-xy")
    );
    assert_eq!(
        pick("scan.asc", b"FIRSTX: 4000\n").map(|r| r.id),
        Some("text-xy")
    );
    assert_eq!(
        pick("scan.dx", b"##TITLE=x\n").map(|r| r.id),
        Some("jcamp-dx")
    );
    assert!(pick("notes.txt", b"just words\n").is_none());
}

#[test]
fn audit_lists_match_the_code() {
    let lines = |s: &str| -> Vec<String> {
        s.lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .map(str::to_string)
            .collect()
    };
    let known: Vec<String> = text::KNOWN_KEYS.iter().map(|k| k.to_string()).collect();
    assert_eq!(lines(include_str!("audit/noti_text.txt")), known);
    assert_eq!(
        lines(include_str!("audit/scarti_text.txt")),
        vec!["blank lines | no information: only white space"]
    );
}
