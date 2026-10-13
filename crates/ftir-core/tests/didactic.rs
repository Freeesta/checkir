//! Didactic engine: verified facts (R2 §1.1, R3 §1 and §4), round trips and line-shape properties.

use ftir_core::didactic::apodization::Apodization;
use ftir_core::didactic::depth::{critical_angle_deg, penetration_depth};
use ftir_core::didactic::fft::{fft, ifft};
use ftir_core::didactic::interferogram::{interferogram_from_lines, Line};
use ftir_core::didactic::ratio::{absorbance_to_ratio, ratio_to_absorbance};
use ftir_core::didactic::spectrum::{
    spectrum_from_interferogram, ComputedSpectrum, Options, Output,
};
use ftir_core::didactic::{json, spring::reduced_mass, spring::spring};

const H: f64 = 1.007_825_032;
const D: f64 = 2.014_101_778;
const C: f64 = 12.0;
const O: f64 = 15.994_914_62;

#[test]
fn spring_matches_the_comfortable_form_and_the_ch_value() {
    // R3 §1: nu ~ 130.3 * sqrt(k / mu); C-H with k 500 N/m, mu 0.93 u -> ~3020 cm-1.
    let s = spring(500.0, C, H).unwrap();
    assert!((s.reduced_mass_u - 0.93).abs() < 0.01);
    assert!((s.wavenumber_cm1 - 3021.0).abs() < 5.0, "{s:?}");
    let approx = 130.3 * (500.0 / s.reduced_mass_u).sqrt();
    assert!((s.wavenumber_cm1 - approx).abs() / approx < 1e-3);
}

#[test]
fn deuteration_ratio_is_about_1_37() {
    let oh = spring(700.0, O, H).unwrap().wavenumber_cm1;
    let od = spring(700.0, O, D).unwrap().wavenumber_cm1;
    assert!((oh / od - 1.3736).abs() < 1e-3, "{}", oh / od);
    let exact = (reduced_mass(O, D).unwrap() / reduced_mass(O, H).unwrap()).sqrt();
    assert!((oh / od - exact).abs() < 1e-12);
}

#[test]
fn spring_rejects_bad_inputs() {
    for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert_eq!(
            spring(bad, 1.0, 1.0).unwrap_err().error_key,
            "didactic.not_positive"
        );
        assert_eq!(
            spring(1.0, bad, 1.0).unwrap_err().error_key,
            "didactic.not_positive"
        );
    }
}

#[test]
fn diamond_45_degrees_depths_match_the_verified_values() {
    // R2 §1.1: diamond 45°, n2 1.5 -> 0.67 / 1.25 / 2.01 / 3.34 µm at 3000 / 1600 / 1000 / 600 cm-1.
    for (nu, expected) in [
        (3000.0, 0.67),
        (1600.0, 1.25),
        (1000.0, 2.01),
        (600.0, 3.34),
    ] {
        let d = penetration_depth(nu, 2.4, 1.5, 45.0).unwrap();
        assert!(
            (d.depth_um - expected).abs() < 0.006,
            "{nu}: {}",
            d.depth_um
        );
    }
    assert!((critical_angle_deg(2.4, 1.5).unwrap() - 38.68).abs() < 0.01);
}

#[test]
fn depth_errors_are_clear() {
    let e = penetration_depth(1000.0, 2.4, 1.5, 30.0).unwrap_err();
    assert_eq!(e.error_key, "didactic.below_critical_angle");
    assert!(e
        .params
        .iter()
        .any(|(k, v)| *k == "critical_angle_deg" && v == "38.68"));
    let at = penetration_depth(1000.0, 2.4, 1.5, 38.6821).unwrap_err();
    assert_eq!(at.error_key, "didactic.below_critical_angle");
    assert_eq!(
        penetration_depth(1000.0, 1.5, 2.4, 45.0)
            .unwrap_err()
            .error_key,
        "didactic.no_total_reflection"
    );
    assert_eq!(
        penetration_depth(1000.0, 2.4, 1.5, 95.0)
            .unwrap_err()
            .error_key,
        "didactic.invalid_angle"
    );
}

#[test]
fn ratio_round_trip_is_exact_and_absent_points_are_nan() {
    let b = [10.0, 8.0, 5.0, 0.0, 4.0];
    let s = [5.0, 8.0, 0.5, 3.0, -1.0];
    let r = ratio_to_absorbance(&s, &b).unwrap();
    assert!((r.absorbance[0] - 2f64.log10()).abs() < 1e-15);
    assert_eq!(r.absorbance[1], 0.0);
    assert!(r.absorbance[3].is_nan() && r.absorbance[4].is_nan());
    for (t, back) in r
        .transmittance
        .iter()
        .zip(absorbance_to_ratio(&r.absorbance))
    {
        assert!(t.is_nan() || (t - back).abs() < 1e-14 * t);
    }
    assert_eq!(
        ratio_to_absorbance(&[1.0], &[1.0, 2.0])
            .unwrap_err()
            .error_key,
        "didactic.length_mismatch"
    );
}

#[test]
fn fft_inverse_restores_the_input_and_rejects_bad_lengths() {
    let mut re: Vec<f64> = (0..32).map(|i| ((i * 7) % 5) as f64 - 1.5).collect();
    let mut im: Vec<f64> = (0..32).map(|i| ((i * 3) % 4) as f64).collect();
    let (r0, i0) = (re.clone(), im.clone());
    fft(&mut re, &mut im).unwrap();
    ifft(&mut re, &mut im).unwrap();
    for k in 0..32 {
        assert!((re[k] - r0[k]).abs() < 1e-12 && (im[k] - i0[k]).abs() < 1e-12);
    }
    assert_eq!(
        fft(&mut [0.0; 6], &mut [0.0; 6]).unwrap_err().error_key,
        "didactic.fft_length"
    );
    assert_eq!(
        fft(&mut [0.0; 4], &mut [0.0; 8]).unwrap_err().error_key,
        "didactic.fft_length"
    );
}

fn opts(opd_max_cm: f64, apodization: Apodization, zero_fill: usize) -> Options {
    Options {
        opd_max_cm,
        apodization,
        zero_fill,
        output: Output::Real,
    }
}

fn line(nu: f64) -> Line {
    Line {
        wavenumber_cm1: nu,
        amplitude: 1.0,
        width_cm1: 0.0,
    }
}

fn argmax(s: &ComputedSpectrum) -> usize {
    (0..s.intensity.len()).fold(0, |m, i| {
        if s.intensity[i] > s.intensity[m] {
            i
        } else {
            m
        }
    })
}

#[test]
fn a_line_is_found_at_its_wavenumber_within_one_step() {
    // OPD_max = 0.25 cm -> resolution 4 cm-1; step 0.0002 cm -> Nyquist 2500 cm-1.
    let ifg = interferogram_from_lines(&[line(1717.3)], 1250, 0.0002).unwrap();
    for zero_fill in [1, 2, 8] {
        let s =
            spectrum_from_interferogram(&ifg, &opts(0.25, Apodization::Boxcar, zero_fill)).unwrap();
        let found = s.wavenumber_cm1[argmax(&s)];
        assert!(
            (found - 1717.3).abs() <= s.point_spacing_cm1,
            "{zero_fill}: {found}"
        );
        assert!((s.resolution_cm1 - 4.0).abs() < 1e-12);
    }
}

#[test]
fn a_line_on_a_grid_point_keeps_its_amplitude() {
    // 2049 samples are padded to 4096 and then by the zero-fill factor 2: the spacing is 1 / (8192 * step).
    let spacing = 1.0 / (8192.0 * 0.0001);
    let nu = 1000.0 * spacing;
    let line = Line {
        wavenumber_cm1: nu,
        amplitude: 0.7,
        width_cm1: 0.0,
    };
    let ifg = interferogram_from_lines(&[line], 1024, 0.0001).unwrap();
    for a in Apodization::ALL {
        let s = spectrum_from_interferogram(&ifg, &opts(0.1, a, 2)).unwrap();
        assert!((s.point_spacing_cm1 - spacing).abs() < 1e-12);
        // The residual is the leakage of the mirror line at -nu through the window, below 0.5 %.
        assert!((s.intensity[argmax(&s)] - 0.7).abs() < 0.0035, "{a:?}");
    }
}

fn maxima_above(s: &ComputedSpectrum, from: f64, to: f64, rel: f64) -> usize {
    let top = s.intensity.iter().cloned().fold(f64::MIN, f64::max);
    (1..s.intensity.len() - 1)
        .filter(|&i| {
            let nu = s.wavenumber_cm1[i];
            let y = &s.intensity;
            nu >= from && nu <= to && y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > rel * top
        })
        .count()
}

#[test]
fn lines_closer_than_the_resolution_are_not_separated_even_with_zero_filling() {
    // OPD_max 0.25 cm -> 1 / OPD_max = 4 cm-1. Two lines 2 cm-1 apart stay one peak; 8 cm-1 apart they split.
    let close = interferogram_from_lines(&[line(1000.0), line(1002.0)], 1250, 0.0002).unwrap();
    let far = interferogram_from_lines(&[line(1000.0), line(1008.0)], 1250, 0.0002).unwrap();
    for zero_fill in [1, 4, 16] {
        let o = opts(0.25, Apodization::Boxcar, zero_fill);
        let near = spectrum_from_interferogram(&close, &o).unwrap();
        assert_eq!(
            maxima_above(&near, 980.0, 1030.0, 0.5),
            1,
            "close, zero_fill {zero_fill}"
        );
        let apart = spectrum_from_interferogram(&far, &o).unwrap();
        assert_eq!(
            maxima_above(&apart, 980.0, 1030.0, 0.5),
            2,
            "far, zero_fill {zero_fill}"
        );
    }
}

fn fwhm(s: &ComputedSpectrum) -> f64 {
    let m = argmax(s);
    let half = s.intensity[m] / 2.0;
    let edge = |dir: isize| {
        let mut i = m as isize;
        while s.intensity[(i + dir) as usize] > half {
            i += dir;
        }
        let (a, b) = (i as usize, (i + dir) as usize);
        let t = (s.intensity[a] - half) / (s.intensity[a] - s.intensity[b]);
        s.wavenumber_cm1[a] + t * (s.wavenumber_cm1[b] - s.wavenumber_cm1[a])
    };
    (edge(1) - edge(-1)).abs()
}

#[test]
fn relative_line_widths_follow_the_apodization_table() {
    // R3 §4 (Bruker): boxcar 0.67, Happ-Genzel 1.0, Blackman-Harris 3-term 1.3 (relative widths).
    let ifg = interferogram_from_lines(&[line(1000.0)], 5000, 0.0001).unwrap();
    let w = |a| fwhm(&spectrum_from_interferogram(&ifg, &opts(0.4, a, 8)).unwrap());
    let hg = w(Apodization::HappGenzel);
    assert!((w(Apodization::Boxcar) / hg - 0.67).abs() < 0.03);
    let bh = w(Apodization::BlackmanHarris3) / hg;
    assert!((bh - 1.3).abs() < 0.08, "{bh}"); // measured ~1.25 for the 3-term window with a0 = 0.42323
    assert!(w(Apodization::Triangular) > w(Apodization::Boxcar));
}

#[test]
fn truncation_sets_the_resolution_and_a_band_gives_a_burst() {
    let band = Line {
        wavenumber_cm1: 1500.0,
        amplitude: 1.0,
        width_cm1: 400.0,
    };
    let ifg = interferogram_from_lines(&[band], 1000, 0.0002).unwrap();
    let centre = ifg.intensity[ifg.zpd_index].abs();
    assert!(ifg
        .intensity
        .iter()
        .skip(ifg.zpd_index + 40)
        .all(|v| v.abs() < 0.05 * centre));
    let s = spectrum_from_interferogram(&ifg, &opts(0.1, Apodization::HappGenzel, 1)).unwrap();
    assert!((s.resolution_cm1 - 10.0).abs() < 1e-12);
    assert!((s.wavenumber_cm1[argmax(&s)] - 1500.0).abs() < 5.0);
}

#[test]
fn spectrum_errors() {
    let ifg = interferogram_from_lines(&[line(1000.0)], 16, 0.001).unwrap();
    let key = |o: Options| spectrum_from_interferogram(&ifg, &o).unwrap_err().error_key;
    assert_eq!(
        key(opts(0.01, Apodization::Boxcar, 3)),
        "didactic.zero_fill"
    );
    assert_eq!(
        key(opts(0.01, Apodization::Boxcar, 0)),
        "didactic.zero_fill"
    );
    assert_eq!(
        key(opts(0.0, Apodization::Boxcar, 1)),
        "didactic.not_positive"
    );
    assert_eq!(
        key(opts(1.0, Apodization::Boxcar, 1 << 30)),
        "didactic.too_many_points"
    );
    assert_eq!(
        interferogram_from_lines(&[], 0, 0.001)
            .unwrap_err()
            .error_key,
        "didactic.too_many_points"
    );
    assert_eq!(
        Apodization::from_id("hann").unwrap_err().error_key,
        "didactic.unknown_apodization"
    );
}

#[test]
fn json_faces_are_valid_and_report_errors_as_data() {
    let s = json::spring_json(500.0, C, H).unwrap();
    assert!(s.contains("\"wavenumber_cm1\":30"), "{s}");
    let r = json::ratio_json(&[1.0, 0.0], &[1.0, 1.0]).unwrap();
    assert!(r.contains("\"absorbance\":[0,null]"), "{r}");
    let i = json::interferogram_from_lines_json(
        "[{\"wavenumber_cm1\":1000,\"amplitude\":1}]",
        64,
        0.001,
    )
    .unwrap();
    let v = ftir_core::passi::json::parse(&i).unwrap();
    assert_eq!(
        v.get("intensity").and_then(|x| x.as_arr()).map(|a| a.len()),
        Some(129)
    );
    let sp = json::spectrum_from_interferogram_json(
        &[0.0, 1.0, 0.0],
        0.001,
        1,
        "{\"opd_max_cm\":0.001,\"apodization\":\"happ_genzel\",\"zero_fill\":2}",
    )
    .unwrap();
    assert!(sp.contains("\"resolution_cm1\":1000"), "{sp}");
    assert_eq!(
        json::spectrum_from_interferogram_json(&[1.0], 0.001, 0, "{}")
            .unwrap_err()
            .error_key,
        "didactic.invalid_input"
    );
    assert!(json::interferogram_from_lines_json("nope", 4, 0.001).is_err());
}
