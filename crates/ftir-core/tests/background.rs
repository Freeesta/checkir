//! `Document::background`: link between sample and background per reader, and the `computed_by` history marker.
use ftir_core::readers::export::to_json;
use ftir_core::readers::model::{
    computed_entry, is_computed, Background, BackgroundKind, Instrument, Limits, Measurement,
    Options, Order, Role, Spectrum, XAxis, XUnit, XValues, YAxis, YUnit,
};
use ftir_core::readers::{ispd, jcamp, text};
use ftir_core::synthetic_ispd as si;
use ftir_core::synthetic_jcamp as sj;
use ftir_core::synthetic_text::{demo_columns, render, Layout};

fn spectrum(role: Role, unit: YUnit, y: Vec<f64>) -> Spectrum {
    Spectrum {
        role,
        x: XAxis {
            unit: XUnit::Cm1,
            order: Order::Ascending,
            values: XValues::Explicit((0..y.len()).map(|i| i as f64).collect()),
        },
        y: YAxis {
            unit,
            values: y,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: Vec::new(),
        fields: Vec::new(),
        warnings: Vec::new(),
    }
}

#[test]
fn ispd_measurements_link_the_background_interferogram() {
    let mut seen = 0;
    for f in si::fixtures()
        .into_iter()
        .filter(|f| f.name != "library_raw")
    {
        let d = ispd::open(&f.bytes, &Limits::STANDARD, &Options::default()).expect("open");
        let has = d
            .spectra
            .iter()
            .any(|s| s.role == Role::BackgroundInterferogram);
        let bg = &d.background;
        if !has {
            assert_eq!(*bg, Background::NONE, "{}", f.name);
            continue;
        }
        seen += 1;
        assert_eq!(bg.present, BackgroundKind::Interferogram, "{}", f.name);
        let at = bg.spectrum_index.expect("index");
        assert_eq!(d.spectra[at].role, Role::BackgroundInterferogram);
        assert_ne!(at, d.primary);
        assert_eq!(bg.digest.as_deref().map(str::len), Some(64));
        let again = ispd::open(&f.bytes, &Limits::STANDARD, &Options::default()).expect("open");
        assert_eq!(again.background, d.background, "digest is deterministic");
        assert!(to_json(&d).contains("\"background\":{\"present\":\"interferogram\""));
    }
    assert!(seen > 0, "no fixture with a background interferogram");
}

#[test]
fn library_import_has_no_background() {
    let f = si::fixtures()
        .into_iter()
        .find(|f| f.name == "library_raw")
        .expect("fixture");
    let d = ispd::open(&f.bytes, &Limits::STANDARD, &Options::default()).expect("open");
    assert_eq!(d.background, Background::NONE);
    assert!(to_json(&d)
        .contains("\"background\":{\"present\":\"none\",\"spectrum_index\":null,\"digest\":null}"));
}

#[test]
fn jcamp_and_text_readers_say_none() {
    for f in sj::fixtures() {
        let d = jcamp::open(&f.bytes, &Limits::STANDARD, &Options::default());
        if let Ok(d) = d {
            let single = d
                .spectra
                .iter()
                .any(|s| matches!(s.y.unit, YUnit::SingleBeam | YUnit::Interferogram));
            if !single {
                assert_eq!(d.background, Background::NONE, "{}", f.name);
            }
        }
    }
    let (x, y) = demo_columns(20);
    let bytes = render(&x, &[&y], &Layout::default());
    let d = text::open(bytes.as_bytes(), &Limits::STANDARD, &Options::default()).expect("open");
    assert_eq!(d.background, Background::NONE);
}

#[test]
fn find_takes_single_beam_and_interferogram_of_unknown_role_but_never_the_sample() {
    let sample = spectrum(Role::Sample, YUnit::Absorbance, vec![0.1, 0.2]);
    let sample_ifg = spectrum(Role::SampleInterferogram, YUnit::Interferogram, vec![1.0]);
    assert_eq!(
        Background::find(&[sample.clone(), sample_ifg.clone()]),
        Background::NONE
    );
    let sb = spectrum(Role::Unknown, YUnit::SingleBeam, vec![3.0, 4.0]);
    let b = Background::find(&[sample.clone(), sb.clone()]);
    assert_eq!(
        (b.present, b.spectrum_index),
        (BackgroundKind::SingleBeam, Some(1))
    );
    let ifg = spectrum(Role::Unknown, YUnit::Interferogram, vec![3.0, 4.0]);
    assert_eq!(
        Background::find(&[ifg]).present,
        BackgroundKind::Interferogram
    );
    let bg = spectrum(Role::Background, YUnit::Absorbance, vec![0.0]);
    assert_eq!(Background::find(&[bg]).present, BackgroundKind::Spectrum);
    // Same values, same digest; different values, different digest.
    let other = spectrum(Role::Unknown, YUnit::SingleBeam, vec![3.0, 4.5]);
    assert_eq!(
        Background::find(&[sb.clone()]).digest,
        Background::find(&[sb]).digest
    );
    assert_ne!(
        Background::find(&[other]).digest,
        Background::find(&[spectrum(Role::Unknown, YUnit::SingleBeam, vec![3.0, 4.0])]).digest
    );
}

#[test]
fn computed_entries_are_recognised() {
    let e = computed_entry("single_beam");
    assert!(is_computed(&e) && e.ends_with("single_beam"));
    assert!(!is_computed("Copied from BKG spectrum"));
}
