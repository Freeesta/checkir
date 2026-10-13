//! Peak detection (package PICCHI) on synthetic spectra with known truth: positions, widths, noise, close bands,
//! shoulders and the comb of N-H⁺ bands on a broad envelope.
use ftir_core::peaks::{detect, result::Kind, result::PeakList, Thresholds};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

fn spectrum(bands: &[(f64, f64, f64)], noise: f64, step: f64, seed: u64) -> Spectrum {
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
        step_cm1: step,
        bands: bands
            .iter()
            .map(|(c, w, h)| Band {
                center_cm1: *c,
                half_width_cm1: *w,
                height: *h,
            })
            .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.04,
        noise,
        seed,
    })
}

fn run(s: &Spectrum) -> PeakList {
    detect(s, &Thresholds::embedded().expect("thresholds")).expect("detect")
}

const BANDS: &[(f64, f64, f64)] = &[
    (3000.0, 20.0, 0.3),
    (1700.0, 8.0, 1.0),
    (1450.0, 10.0, 0.5),
    (1250.0, 6.0, 0.4),
    (1000.0, 12.0, 0.7),
    (800.0, 9.0, 0.35),
];

#[test]
fn positions_and_widths_are_found_for_known_bands() {
    for step in [2.0, 1.0] {
        let r = run(&spectrum(BANDS, 0.0005, step, 7));
        let peaks: Vec<_> = r.peaks.iter().filter(|p| p.kind == Kind::Peak).collect();
        assert_eq!(peaks.len(), BANDS.len(), "step {step}: {:?}", r.peaks);
        for (band, p) in BANDS.iter().zip(peaks.iter().rev()) {
            assert!((p.position_cm1 - band.0).abs() <= 0.5, "{band:?} {p:?}");
            let fwhm = p.fwhm_cm1.expect("fwhm");
            assert!(
                (fwhm - 2.0 * band.1).abs() <= 0.05 * 2.0 * band.1,
                "{band:?} {fwhm}"
            );
        }
    }
}

#[test]
fn pure_noise_gives_almost_no_peaks() {
    let total: usize = (0..100u64)
        .map(|seed| run(&spectrum(&[], 0.002, 2.0, seed + 1)).peaks.len())
        .sum();
    assert!(total < 50, "{total} peaks in 100 noise spectra");
}

#[test]
fn two_bands_12_cm1_apart_are_two_peaks() {
    let s = spectrum(&[(1500.0, 5.0, 0.8), (1512.0, 5.0, 0.7)], 0.0005, 2.0, 3);
    let r = run(&s);
    let at: Vec<f64> = r.peaks.iter().map(|p| p.position_cm1).collect();
    assert_eq!(at.len(), 2, "{at:?}");
    assert!((at[1] - at[0] - 12.0).abs() <= 1.5, "{at:?}");
}

#[test]
fn the_result_carries_chain_noise_thresholds_and_regions() {
    let r = run(&spectrum(BANDS, 0.0005, 2.0, 7));
    assert_eq!(r.chain_id, "peak_detect_v1");
    assert_eq!(r.thresholds_version, 2);
    assert!(r.noise_abs > 0.0 && r.noise_abs < 0.002, "{}", r.noise_abs);
    let carbonyl = r
        .peaks
        .iter()
        .find(|p| (p.position_cm1 - 1700.0).abs() < 1.0);
    assert_eq!(carbonyl.expect("1700").region_ids, vec!["carbonyl"]);
    let json = r.to_json();
    assert!(
        json.starts_with(r#"{"schema":"peaks/1","spectrum_id":null,"#),
        "{json}"
    );
}

fn kinds(r: &PeakList, kind: Kind) -> Vec<f64> {
    r.peaks
        .iter()
        .filter(|p| p.kind == kind)
        .map(|p| p.position_cm1)
        .collect()
}

#[test]
fn a_shoulder_on_the_flank_of_a_taller_band_is_found() {
    // A band at 30 % of the height, 15 cm-1 from a taller one: one maximum, plus a shoulder.
    let r = run(&spectrum(
        &[(1700.0, 8.0, 1.0), (1685.0, 8.0, 0.3)],
        0.0005,
        2.0,
        5,
    ));
    let shoulders = kinds(&r, Kind::Shoulder);
    assert_eq!(kinds(&r, Kind::Peak).len(), 1, "{:?}", r.peaks);
    assert_eq!(shoulders.len(), 1, "{:?}", r.peaks);
    assert!((shoulders[0] - 1685.0).abs() <= 4.0, "{shoulders:?}");
    let s = r
        .peaks
        .iter()
        .find(|p| p.kind == Kind::Shoulder)
        .expect("shoulder");
    assert!(
        s.fwhm_cm1.is_none() && s.shape.is_none(),
        "a shoulder has no width"
    );
    assert!(
        s.prominence_rel > 0.03 && s.prominence_rel < 0.5,
        "{} {:?}",
        s.prominence_rel,
        s
    );
}

#[test]
fn a_single_band_has_no_shoulder_and_no_broad_band() {
    let r = run(&spectrum(
        &[(1700.0, 8.0, 1.0), (1000.0, 8.0, 0.5)],
        0.0005,
        2.0,
        5,
    ));
    assert!(kinds(&r, Kind::Shoulder).is_empty(), "{:?}", r.peaks);
    assert!(r.broad_bands.is_empty(), "{:?}", r.broad_bands);
}

#[test]
fn a_comb_of_narrow_bands_on_a_broad_envelope_gives_peaks_and_a_broad_band() {
    let mut bands = vec![(2600.0, 150.0, 0.4)];
    bands.extend((0..10).map(|k| (2487.5 + 25.0 * f64::from(k), 4.0, 0.1)));
    let r = run(&spectrum(&bands, 0.0005, 2.0, 5));
    // Every comb band is a maximum; the one on top of the envelope may merge with the envelope's own maximum.
    let at = |c: f64| {
        r.peaks
            .iter()
            .any(|p| p.kind == Kind::Peak && (p.position_cm1 - c).abs() <= 3.0)
    };
    assert!(
        (0..10).all(|k| at(2487.5 + 25.0 * f64::from(k))),
        "{:?}",
        r.peaks
    );
    let narrow = r
        .peaks
        .iter()
        .filter(|p| p.kind == Kind::Peak && p.fwhm_cm1.is_some_and(|w| w < 15.0))
        .count();
    assert!(narrow >= 9, "{narrow}");
    assert_eq!(r.broad_bands.len(), 1, "{:?}", r.broad_bands);
    let b = &r.broad_bands[0];
    assert!(
        b.from_cm1 < 2520.0 && b.to_cm1 > 2680.0 && (b.max_cm1 - 2600.0).abs() < 30.0,
        "{b:?}"
    );
    assert!(b.region_ids.contains(&"salt_nh".to_string()), "{b:?}");
}

#[test]
fn co2_and_vapour_are_labelled_only_when_the_alert_is_active() {
    let clean = run(&spectrum(&[(1700.0, 8.0, 1.0)], 0.0005, 2.0, 5));
    assert!(clean.peaks.iter().all(|p| p.artifact.is_none()));
    let dirty = run(&spectrum(
        &[
            (1700.0, 8.0, 1.0),
            (2349.0, 3.0, 0.05),
            (1650.0, 1.5, 0.05),
            (3700.0, 2.0, 0.03),
        ],
        0.0005,
        2.0,
        5,
    ));
    assert!(
        dirty.warnings.iter().any(|w| w.id == "co2_vapour"),
        "{:?}",
        dirty.warnings
    );
    let artifacts: Vec<_> = dirty
        .peaks
        .iter()
        .filter(|p| p.artifact.is_some())
        .collect();
    let co2 = artifacts
        .iter()
        .find(|p| (p.position_cm1 - 2349.0).abs() < 4.0);
    assert!(co2.is_some(), "{artifacts:?}");
    let vapour = artifacts
        .iter()
        .find(|p| (p.position_cm1 - 1650.0).abs() < 4.0);
    assert!(vapour.is_some(), "{artifacts:?}");
    let band = dirty
        .peaks
        .iter()
        .find(|p| (p.position_cm1 - 1700.0).abs() < 2.0)
        .expect("1700");
    assert!(band.artifact.is_none(), "a real band is never labelled");
}

#[test]
fn too_many_peaks_raises_a_warning_with_the_numbers() {
    let bands: Vec<(f64, f64, f64)> = (0..90)
        .map(|k| (600.0 + 13.0 * f64::from(k), 3.0, 0.3))
        .collect();
    let r = run(&spectrum(&bands, 0.0005, 2.0, 5));
    let w = r
        .warnings
        .iter()
        .find(|w| w.id == "too_many_peaks")
        .unwrap_or_else(|| panic!("no warning: {} peaks, {:?}", r.peaks.len(), r.warnings));
    assert!(w.data.iter().any(|(k, _)| k == "count") && w.data.iter().any(|(k, _)| k == "limit"));
}

#[test]
fn transmittance_is_converted_and_unusable_spectra_are_refused() {
    use ftir_core::spectrum::{Role, YUnit};
    let a = spectrum(BANDS, 0.0005, 2.0, 7);
    let t = Spectrum::new(
        Role::Sample,
        YUnit::Transmittance,
        a.wavenumber_cm1.clone(),
        a.y.iter().map(|v| 100.0 * 10f64.powf(-v)).collect(),
    );
    assert_eq!(run(&t).peaks.len(), run(&a).peaks.len());
    let short = Spectrum::new(
        Role::Sample,
        YUnit::Absorbance,
        vec![1000.0, 1002.0, 1004.0],
        vec![0.0; 3],
    );
    let e = detect(&short, &Thresholds::embedded().expect("thresholds")).expect_err("short");
    assert!(
        e.error_key.starts_with("passi.") || e.error_key.starts_with("peaks."),
        "{}",
        e.error_key
    );
    let narrow = spectrum(&[(1000.0, 8.0, 1.0)], 0.0005, 2.0, 1);
    let cut = Spectrum::new(
        Role::Sample,
        YUnit::Absorbance,
        narrow
            .wavenumber_cm1
            .iter()
            .copied()
            .filter(|x| *x < 1500.0)
            .collect(),
        narrow.y[narrow
            .wavenumber_cm1
            .iter()
            .position(|x| *x < 1500.0)
            .expect("cut")..]
            .to_vec(),
    );
    assert_eq!(
        detect(&cut, &Thresholds::embedded().expect("thresholds"))
            .expect_err("no quiet window")
            .error_key,
        "peaks.rumore_non_misurabile"
    );
}

#[test]
fn the_json_entry_point_reads_a_spectrum_and_an_id_and_reports_errors_as_data() {
    let s = spectrum(BANDS, 0.0005, 2.0, 7);
    let list = |v: &[f64]| {
        v.iter()
            .map(|n| format!("{n}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    let q = format!(
        r#"{{"spectrum_id":"s7","wavenumber_cm1":[{}],"y":[{}]}}"#,
        list(&s.wavenumber_cm1),
        list(&s.y)
    );
    let out = ftir_core::peaks::detect_json(&q, "").expect("peaks");
    assert!(
        out.contains(r#""spectrum_id":"s7""#) && out.contains(r#""schema":"peaks/1""#),
        "{out}"
    );
    assert_eq!(
        out,
        ftir_core::peaks::detect_json(&q, "").expect("again"),
        "deterministic"
    );
    let e = ftir_core::peaks::detect_json("{}", "").expect_err("empty");
    assert!(e.json().contains("error_key"));
    let bad = ftir_core::peaks::detect_json(&q, r#"{"schema":"x/1"}"#).expect_err("thresholds");
    assert_eq!(bad.error_key, "peaks.soglie_non_valide");
}

/// Class of the peak at `cm1` when the cuts of the thresholds file are `strong`/`medium`.
fn class_at(s: &Spectrum, strong: &str, medium: &str, cm1: f64) -> String {
    let file = include_str!("../../../data/soglie/peaks_thresholds-1.json").replace(
        "\"intensity_classes\": { \"strong_rel_min\": 0.5, \"medium_rel_min\": 0.2 }",
        &format!(
            "\"intensity_classes\": {{ \"strong_rel_min\": {strong}, \"medium_rel_min\": {medium} }}"
        ),
    );
    let t = Thresholds::parse(&file).expect("thresholds");
    let list = detect(s, &t).expect("detect");
    let json = list.to_json();
    assert!(json.contains("\"intensity\""), "{json}");
    let p = list
        .peaks
        .iter()
        .find(|p| (p.position_cm1 - cm1).abs() < 1.0)
        .expect("peak");
    p.intensity.id().to_string()
}

#[test]
fn the_intensity_class_follows_the_cuts_of_the_thresholds_file() {
    let s = spectrum(BANDS, 0.0005, 2.0, 7);
    // 1450 cm-1 has a prominence of about half the highest band.
    let rel = run(&s)
        .peaks
        .iter()
        .find(|p| (p.position_cm1 - 1450.0).abs() < 1.0)
        .expect("peak")
        .prominence_rel;
    assert!((0.3..0.7).contains(&rel), "{rel}");
    assert_eq!(
        class_at(&s, "0.5", "0.2", 1450.0),
        if rel >= 0.5 { "strong" } else { "medium" }
    );
    assert_eq!(class_at(&s, "0.95", "0.9", 1450.0), "weak");
    assert_eq!(class_at(&s, "0.95", "0.1", 1450.0), "medium");
    assert_eq!(class_at(&s, "0.1", "0.05", 1450.0), "strong");
}
