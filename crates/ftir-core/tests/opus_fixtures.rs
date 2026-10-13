//! Bruker OPUS reader on synthetic files: round trip with the synthetic generator, computed absorbance, metadata,
//! anonymity, limits, truncated and damaged files.
use ftir_core::readers::anonymize::anonymize;
use ftir_core::readers::export::to_json;
use ftir_core::readers::model::{
    BackgroundKind, Confidence, Document, Limits, Options, Order, Role, XUnit, XValues, YUnit,
};
use ftir_core::readers::{opus, pick};
use ftir_core::synthetic::Params;
use ftir_core::synthetic_opus::{
    assemble, blocks, param_block, write, Spec, HISTORY, OPERATOR, P, SAMPLE, SERIAL,
};

fn open(bytes: &[u8]) -> Result<Document, String> {
    opus::open(bytes, &Limits::STANDARD, &Options::default()).map_err(|e| e.key.to_string())
}

fn demo() -> Spec {
    Spec::from_params(&Params::demo())
}

#[test]
fn round_trip_with_the_synthetic_spectrum() {
    let truth = ftir_core::synthetic::generate(&Params::demo());
    let d = open(&write(&demo())).expect("open");
    assert_eq!(d.primary, 0);
    let s = &d.spectra[0];
    assert_eq!(
        (s.role, s.y.unit, s.x.unit),
        (Role::Sample, YUnit::Absorbance, XUnit::Cm1)
    );
    assert_eq!(s.x.order, Order::Descending);
    assert_eq!(
        s.x.values,
        XValues::Regular {
            first: 4000.0,
            last: 400.0,
            n: truth.len()
        }
    );
    assert_eq!(s.x.values.to_vec(), truth.wavenumber_cm1);
    assert_eq!(s.y.values.len(), truth.y.len());
    for (a, b) in s.y.values.iter().zip(&truth.y) {
        assert!((a - b).abs() <= 1e-6 * b.abs().max(1.0), "{a} {b}");
    }
    assert_eq!(d.background.present, BackgroundKind::None);
}

#[test]
fn metadata_comes_from_the_parameters() {
    let d = open(&write(&demo())).expect("open");
    let s = &d.spectra[0];
    assert_eq!(
        s.instrument.resolution_cm1.as_ref().map(|v| v.value),
        Some(4.0)
    );
    assert_eq!(s.instrument.scans.as_ref().map(|v| v.value), Some(32));
    assert_eq!(
        s.instrument.model.as_ref().map(|v| v.value.as_str()),
        Some("VERTEX 70")
    );
    assert_eq!(
        s.instrument
            .serial_number
            .as_ref()
            .map(|v| v.value.as_str()),
        Some(SERIAL)
    );
    assert_eq!(
        s.measurement.sample_name.as_ref().map(|v| v.value.as_str()),
        Some(SAMPLE)
    );
    assert_eq!(
        s.measurement.datetime.as_ref().map(|v| v.value.as_str()),
        Some("2019-03-15T09:12:34+01:00")
    );
    assert_eq!(s.history, vec![HISTORY.to_string()]);
    for f in [
        &s.instrument.resolution_cm1.as_ref().map(|v| v.field),
        &s.instrument.scans.as_ref().map(|v| v.field),
    ] {
        assert!(f.is_some_and(|i| s.fields.get(i).is_some()));
    }
}

#[test]
fn absorbance_is_computed_when_ab_is_missing() {
    let p = Params::demo();
    let truth = ftir_core::synthetic::generate(&p);
    let d = open(&write(&Spec::single_channel(&p))).expect("open");
    assert_eq!(d.spectra.len(), 3);
    let s = &d.spectra[d.primary];
    assert_eq!(s.y.unit, YUnit::Absorbance);
    assert!(s
        .history
        .iter()
        .any(|h| h.starts_with("computed_by: checkir")));
    for (a, b) in s.y.values.iter().zip(&truth.y) {
        assert!((a - b).abs() < 1e-4, "{a} {b}");
    }
    assert_eq!(d.spectra[1].y.unit, YUnit::SingleBeam);
    assert_eq!(d.background.present, BackgroundKind::SingleBeam);
    assert!(d
        .warnings
        .iter()
        .any(|w| w.key == "reader.opus.absorbance_computed"));
    let mut only_sample = Spec::single_channel(&p);
    only_sample.sc_rf = None;
    assert_eq!(
        open(&write(&only_sample)).unwrap_err(),
        "reader.opus.no_spectrum"
    );
}

#[test]
fn the_scale_factor_is_applied() {
    let mut spec = demo();
    spec.csf = 0.5;
    let d = open(&write(&spec)).expect("open");
    let plain = open(&write(&demo())).expect("open");
    for (a, b) in d.spectra[0].y.values.iter().zip(&plain.spectra[0].y.values) {
        assert!((a * 2.0 - b).abs() < 1e-12);
    }
}

#[test]
fn detection_is_by_signature() {
    let bytes = write(&demo());
    assert_eq!(pick("x.0", &bytes).map(|r| r.id), Some("bruker-opus"));
    assert_eq!(pick("x.dx", &bytes).map(|r| r.id), Some("bruker-opus"));
    assert_eq!(opus::detect("x.0", b"##TITLE=x"), Confidence::No);
    assert!(pick("x.0", b"1,2\n3,4\n").is_none());
}

#[test]
fn nothing_identifying_survives_the_anonymous_export() {
    let d = open(&write(&demo())).expect("open");
    let json = to_json(&d);
    for secret in [
        SAMPLE,
        OPERATOR,
        "kitchen-table-9",
        SERIAL,
        "gneri",
        "Servizio Alfa",
    ] {
        assert!(json.contains(secret), "the plain export has {secret}");
    }
    let anon = to_json(&anonymize(&d, b"secret"));
    for secret in [
        SAMPLE,
        OPERATOR,
        "kitchen-table-9",
        SERIAL,
        "gneri",
        "Servizio Alfa",
        "15/03/2019",
        "09:12",
    ] {
        assert!(!anon.contains(secret), "{secret} survived");
    }
    assert!(anon.contains("2019-03"));
}

#[test]
fn limits_are_checked_before_allocating() {
    let bytes = write(&demo());
    let few = Limits {
        max_points: 100,
        ..Limits::STANDARD
    };
    let e = opus::open(&bytes, &few, &Options::default()).unwrap_err();
    assert_eq!(
        (e.key, e.params[0].1.as_str()),
        ("reader.limit_exceeded", "points")
    );
    let small = Limits {
        max_bytes: bytes.len() - 1,
        ..Limits::STANDARD
    };
    assert_eq!(
        opus::open(&bytes, &small, &Options::default())
            .unwrap_err()
            .key,
        "reader.limit_exceeded"
    );
    let fields = Limits {
        max_fields: 3,
        ..Limits::STANDARD
    };
    assert_eq!(
        opus::open(&bytes, &fields, &Options::default())
            .unwrap_err()
            .key,
        "reader.limit_exceeded"
    );
}

#[test]
fn a_file_cut_at_any_byte_is_an_error_and_never_a_panic() {
    for spec in [demo(), Spec::single_channel(&Params::demo())] {
        let bytes = write(&spec);
        for len in 0..bytes.len() {
            let r = opus::open(
                bytes.get(..len).unwrap_or(&[]),
                &Limits::STANDARD,
                &Options::default(),
            );
            assert!(r.is_err(), "length {len} of {} opened", bytes.len());
        }
    }
}

#[test]
fn damaged_files_give_errors() {
    let good = blocks(&demo());
    // A block that starts inside the directory.
    let mut bytes = write(&demo());
    bytes[24 + 8..24 + 12].copy_from_slice(&24u32.to_le_bytes());
    assert_eq!(open(&bytes).unwrap_err(), "reader.opus.corrupt");
    // A length that goes far beyond the file.
    let mut bytes = write(&demo());
    let last = 24 + 12 * (good.len() - 1);
    bytes[last + 4..last + 8].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(open(&bytes).unwrap_err(), "reader.opus.truncated");
    // A directory that declares more entries than the file holds.
    let mut bytes = write(&demo());
    bytes[20..24].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(open(&bytes).unwrap_err(), "reader.limit_exceeded");
    let mut bytes = write(&demo());
    bytes[20..24].copy_from_slice(&5000u32.to_le_bytes());
    assert_eq!(open(&bytes).unwrap_err(), "reader.opus.truncated");
    // A directory that starts in the header.
    let mut bytes = write(&demo());
    bytes[12..16].copy_from_slice(&8u32.to_le_bytes());
    assert_eq!(open(&bytes).unwrap_err(), "reader.opus.corrupt");
    // More points than the data block holds.
    let mut spec = demo();
    spec.ab.as_mut().expect("ab").y.truncate(10);
    let mut b = blocks(&spec);
    let n = b.len();
    b[n - 1].3.truncate(8);
    assert_eq!(open(&assemble(&b)).unwrap_err(), "reader.opus.bad_data");
}

#[test]
fn bad_axis_and_units_are_reported() {
    let mut b = blocks(&demo());
    let at = b.iter().position(|x| x.0 == 31).expect("params");
    let params = |dxu: &str, first: f64, last: f64, dpf: i32| {
        param_block(&[
            ("DPF", P::Int(dpf)),
            ("NPT", P::Int(901)),
            ("FXV", P::Real(first)),
            ("LXV", P::Real(last)),
            ("DXU", P::Text(dxu)),
        ])
    };
    b[at].3 = params("XX", 4000.0, 400.0, 1);
    assert_eq!(
        open(&assemble(&b)).unwrap_err(),
        "reader.opus.x_unit_unknown"
    );
    b[at].3 = params("WN", 400.0, 400.0, 1);
    assert_eq!(open(&assemble(&b)).unwrap_err(), "reader.opus.bad_data");
    b[at].3 = params("WN", 4000.0, 400.0, 2);
    assert_eq!(open(&assemble(&b)).unwrap_err(), "reader.opus.data_format");
    b[at].3 = params("WN", f64::NAN, 400.0, 1);
    assert_eq!(open(&assemble(&b)).unwrap_err(), "reader.opus.bad_data");
}

#[test]
fn mutated_files_never_panic() {
    let bytes = write(&Spec::single_channel(&Params::demo()));
    let step = 7;
    for at in (0..bytes.len().min(1200))
        .step_by(1)
        .chain((1200..bytes.len()).step_by(step))
    {
        for v in [0u8, 1, 0x7f, 0xff] {
            let mut m = bytes.clone();
            if let Some(b) = m.get_mut(at) {
                *b = v;
            }
            let _ = opus::open(&m, &Limits::STANDARD, &Options::default());
        }
    }
}

#[test]
fn committed_fixtures_are_up_to_date() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/opus");
    let p = Params::demo();
    for (name, spec) in [
        ("absorbance.0", Spec::from_params(&p)),
        ("single_channel.0", Spec::single_channel(&p)),
    ] {
        let on_disk = std::fs::read(dir.join(name)).expect("fixture file");
        assert!(on_disk == write(&spec), "{name}: rerun gen_opus_fixtures");
        assert!(open(&on_disk).is_ok(), "{name}");
    }
}
