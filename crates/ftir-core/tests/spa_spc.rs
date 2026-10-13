//! Thermo OMNIC `.spa` and Galactic `.spc` readers on synthetic files: axis, values, units, identity fields, truncation at
//! every byte, limits, refused variants.
use ftir_core::readers::model::{Document, Limits, Options, Order, XUnit, XValues, YUnit};
use ftir_core::readers::{pick, spa, spc};
use ftir_core::synthetic_spa::{self, SpaSpec};
use ftir_core::synthetic_spc::{self, SpcSpec};
use std::path::PathBuf;

fn dir(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

fn open_spa(b: &[u8]) -> Result<Document, String> {
    spa::open(b, &Limits::STANDARD, &Options::default()).map_err(|e| e.key.to_string())
}

fn open_spc(b: &[u8]) -> Result<Document, String> {
    spc::open(b, &Limits::STANDARD, &Options::default()).map_err(|e| e.key.to_string())
}

fn near(got: &[f64], want: &[f64], tol: f64) -> bool {
    got.len() == want.len() && got.iter().zip(want).all(|(g, w)| (g - w).abs() <= tol)
}

#[test]
fn committed_fixtures_are_up_to_date() {
    for (name, s) in synthetic_spa::fixtures() {
        let disk = std::fs::read(dir("spa").join(format!("{name}.spa"))).expect("fixture");
        assert!(
            disk == synthetic_spa::build(&s),
            "{name}: rerun gen_spa_spc_fixtures"
        );
    }
    for (name, s) in synthetic_spc::fixtures() {
        let disk = std::fs::read(dir("spc").join(format!("{name}.spc"))).expect("fixture");
        assert!(
            disk == synthetic_spc::build(&s),
            "{name}: rerun gen_spa_spc_fixtures"
        );
    }
}

#[test]
fn spa_gives_axis_values_unit_and_identity_fields() {
    for (name, s) in synthetic_spa::fixtures() {
        let doc = open_spa(&synthetic_spa::build(&s)).expect(name);
        let sp = doc.spectra.first().expect("spectrum");
        assert_eq!(sp.x.unit, XUnit::Cm1, "{name}");
        assert_eq!(sp.x.order, Order::Descending, "{name}");
        assert_eq!(
            sp.x.values,
            XValues::Regular {
                first: 4000.0,
                last: 400.0,
                n: 181
            },
            "{name}"
        );
        let want: Vec<f64> = s.y.iter().map(|&v| f64::from(v)).collect();
        assert!(sp.y.values == want, "{name}");
        let unit = if s.y_code == 0x10 {
            YUnit::TransmittancePercent
        } else {
            YUnit::Absorbance
        };
        assert_eq!(sp.y.unit, unit, "{name}");
        let title = sp.measurement.title.as_ref().expect("title");
        assert_eq!(title.value, synthetic_spa::TITLE);
        assert!(
            sp.fields.get(title.field).is_some_and(|f| f.identity),
            "{name}"
        );
        let has_date = sp.measurement.datetime.is_some();
        assert_eq!(
            has_date, !s.library,
            "{name}: the date of a library entry means nothing"
        );
        if let Some(d) = &sp.measurement.datetime {
            assert_eq!(d.value, "2026-03-14T12:00:00Z");
        }
        assert!(
            sp.fields.iter().filter(|f| f.identity).count() >= 3,
            "{name}"
        );
        assert!(sp.fields.iter().all(|f| f.known), "{name}");
        assert_eq!(sp.history, vec![synthetic_spa::HISTORY.to_string()]);
    }
}

#[test]
fn spa_refuses_what_it_cannot_read_and_says_why() {
    let good = synthetic_spa::fixtures().remove(0).1;
    let with = |f: &dyn Fn(&mut SpaSpec)| {
        let mut s = good.clone();
        f(&mut s);
        open_spa(&synthetic_spa::build(&s))
    };
    assert_eq!(
        open_spa(b"hello, not a spa file").unwrap_err(),
        "reader.spa.not_spa"
    );
    assert_eq!(with(&|s| s.x_code = 32).unwrap_err(), "reader.spa.x_unit");
    assert_eq!(
        with(&|s| s.first = s.last).unwrap_err(),
        "reader.spa.bad_data"
    );
    let unknown = with(&|s| s.y_code = 99).expect("unknown y unit still opens");
    assert_eq!(unknown.spectra[0].y.unit, YUnit::Unknown);
    assert!(unknown
        .warnings
        .iter()
        .any(|w| w.key == "reader.spa.yunits_unknown"));
    let mut bytes = synthetic_spa::build(&good);
    bytes[304 + 16 + 2] = 0xFF; // section 3 starts beyond the file
    assert_eq!(open_spa(&bytes).unwrap_err(), "reader.spa.truncated");
    let mut bytes = synthetic_spa::build(&good);
    let info = u32::from_le_bytes(bytes[306..310].try_into().expect("4 bytes")) as usize;
    bytes[info + 4..info + 8].copy_from_slice(&u32::MAX.to_le_bytes()); // header declares 4 billion points
    let e = spa::open(
        &bytes,
        &Limits {
            max_points: 1000,
            ..Limits::STANDARD
        },
        &Options::default(),
    );
    assert_eq!(e.unwrap_err().key, "reader.limit_exceeded");
}

#[test]
fn spa_cut_at_every_byte_never_panics_and_is_an_error() {
    for (name, s) in synthetic_spa::fixtures()
        .into_iter()
        .filter(|(_, s)| !s.library)
    {
        let bytes = synthetic_spa::build(&s);
        for cut in 0..bytes.len() {
            assert!(open_spa(&bytes[..cut]).is_err(), "{name} cut at {cut}");
        }
    }
}

#[test]
fn spc_gives_the_values_of_every_layout() {
    let a = synthetic_spa::absorbance();
    for (name, s) in synthetic_spc::fixtures() {
        if s.version != 0x4B {
            continue;
        }
        let doc = open_spc(&synthetic_spc::build(&s)).expect(name);
        assert_eq!(doc.spectra.len(), s.subs.len(), "{name}");
        for (got, want) in doc.spectra.iter().zip(&s.subs) {
            let tol = match name {
                "int16" => 4e-5,
                "int32" => 1e-8,
                "transmittance" => 1e-4,
                _ => 1e-6,
            };
            assert!(
                near(
                    &got.y.values,
                    &want.y,
                    tol * want.y.iter().fold(1.0, |m: f64, v| m.max(v.abs()))
                ),
                "{name}"
            );
            let n = want.y.len();
            match (&want.x, &s.x) {
                (Some(x), _) | (None, Some(x)) => {
                    assert_eq!(got.x.order, Order::Descending, "{name}");
                    assert!(near(&got.x.values.to_vec(), &x[..n], 1e-3), "{name}");
                }
                _ => assert_eq!(
                    got.x.values,
                    XValues::Regular {
                        first: 4000.0,
                        last: 400.0,
                        n
                    },
                    "{name}"
                ),
            }
            assert_eq!(got.x.unit, XUnit::Cm1, "{name}");
            let unit = if name == "transmittance" {
                YUnit::TransmittancePercent
            } else {
                YUnit::Absorbance
            };
            assert_eq!(got.y.unit, unit, "{name}");
        }
    }
    assert_eq!(a.len(), 181);
}

#[test]
fn spc_date_and_comment_identify() {
    let s = synthetic_spc::fixtures().remove(0).1;
    let doc = open_spc(&synthetic_spc::build(&s)).expect("open");
    let sp = &doc.spectra[0];
    assert_eq!(
        sp.measurement.datetime.as_ref().map(|d| d.value.as_str()),
        Some("2026-03-14T12:00")
    );
    let comment = sp
        .fields
        .iter()
        .find(|f| f.key == "COMMENT")
        .expect("comment");
    assert!(comment.identity && comment.value == synthetic_spc::COMMENT);
    assert!(sp.fields.iter().all(|f| f.known));
}

#[test]
fn spc_old_and_foreign_formats_get_their_own_error() {
    let fixtures = synthetic_spc::fixtures();
    let old = &fixtures
        .iter()
        .find(|(n, _)| *n == "old_format")
        .expect("old")
        .1;
    assert_eq!(
        open_spc(&synthetic_spc::build(old)).unwrap_err(),
        "reader.spc.old_format"
    );
    let mut be = synthetic_spc::build(old);
    be[1] = 0x4C;
    assert_eq!(open_spc(&be).unwrap_err(), "reader.spc.big_endian");
    assert_eq!(
        open_spc(b"plain text, not spc").unwrap_err(),
        "reader.spc.not_spc"
    );
    let mut odd: SpcSpec = fixtures[0].1.clone();
    odd.x_type = 4;
    assert_eq!(
        open_spc(&synthetic_spc::build(&odd)).unwrap_err(),
        "reader.spc.x_unit"
    );
    odd.x_type = 1;
    odd.y_type = 77;
    let doc = open_spc(&synthetic_spc::build(&odd)).expect("opens");
    assert_eq!(doc.spectra[0].y.unit, YUnit::Unknown);
    assert!(doc.spectra[0]
        .warnings
        .iter()
        .any(|w| w.key == "reader.spc.yunits_unknown"));
}

#[test]
fn spc_cut_at_every_byte_never_panics_and_is_an_error() {
    for (name, s) in synthetic_spc::fixtures() {
        let bytes = synthetic_spc::build(&s);
        for cut in 0..bytes.len() {
            assert!(open_spc(&bytes[..cut]).is_err(), "{name} cut at {cut}");
        }
    }
}

#[test]
fn spc_limits_are_checked_before_allocating() {
    let s = synthetic_spc::fixtures().remove(0).1;
    let mut bytes = synthetic_spc::build(&s);
    bytes[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
    let small = Limits {
        max_points: 1000,
        ..Limits::STANDARD
    };
    assert_eq!(
        spc::open(&bytes, &small, &Options::default())
            .unwrap_err()
            .key,
        "reader.limit_exceeded"
    );
    let mut many = synthetic_spc::build(&s);
    many[0] |= synthetic_spc::MULTI;
    many[24..28].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(
        spc::open(&many, &small, &Options::default())
            .unwrap_err()
            .key,
        "reader.limit_exceeded"
    );
    let tiny = Limits {
        max_bytes: 100,
        ..Limits::STANDARD
    };
    assert_eq!(
        spc::open(&many, &tiny, &Options::default())
            .unwrap_err()
            .key,
        "reader.limit_exceeded"
    );
}

#[test]
fn the_registry_picks_the_right_reader() {
    let a = synthetic_spa::build(&synthetic_spa::fixtures().remove(0).1);
    assert_eq!(pick("x.spa", &a).map(|r| r.id), Some("thermo-spa"));
    assert_eq!(pick("x.bin", &a).map(|r| r.id), Some("thermo-spa"));
    assert!(pick("x.spg", &a).is_none());
    let c = synthetic_spc::build(&synthetic_spc::fixtures().remove(0).1);
    assert_eq!(pick("x.spc", &c).map(|r| r.id), Some("galactic-spc"));
    assert_eq!(pick("x.bin", &c).map(|r| r.id), Some("galactic-spc"));
    assert!(pick("x.bin", &c[..100]).is_none());
}
