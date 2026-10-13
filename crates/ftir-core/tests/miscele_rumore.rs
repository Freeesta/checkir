//! The mixture search under realistic white noise (0.005, 0.01, 0.02 of uniform amplitude on bands of height 0.3-0.9): the two
//! components are found, nothing stays unexplained and no alert is raised. Synthetic regression test, not performance.
use ftir_core::miscele::dati::{Cuts, Thresholds};
use ftir_core::miscele::{analyze, Candidate};
use ftir_core::peaks;
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

type Bands = &'static [(f64, f64, f64)];

/// (centre, half-width, height): the bands of the page's synthetic library (alfa, beta, gamma).
const ALFA: Bands = &[
    (700.0, 12.0, 0.6),
    (1000.0, 14.0, 0.9),
    (1250.0, 10.0, 0.5),
    (1500.0, 16.0, 0.7),
    (2900.0, 20.0, 0.4),
];
const BETA: Bands = &[
    (800.0, 12.0, 0.5),
    (1100.0, 14.0, 0.8),
    (1350.0, 10.0, 0.9),
    (1650.0, 16.0, 0.6),
    (3000.0, 20.0, 0.5),
];
const GAMMA: Bands = &[
    (750.0, 12.0, 0.7),
    (1200.0, 14.0, 0.6),
    (1450.0, 10.0, 0.8),
    (1700.0, 16.0, 0.5),
    (3100.0, 20.0, 0.3),
];

fn spectrum(parts: &[(Bands, f64)], seed: u64, noise: f64) -> Spectrum {
    let mut bands = Vec::new();
    for (list, scale) in parts {
        for &(c, w, h) in list.iter() {
            bands.push(Band {
                center_cm1: c,
                half_width_cm1: w,
                height: h * scale,
            });
        }
    }
    generate(&Params {
        from_cm1: 650.0,
        to_cm1: 3800.0,
        step_cm1: 2.0,
        bands,
        baseline_offset: 0.01,
        baseline_slope: 0.0,
        noise,
        seed,
    })
}

fn candidate(id: &str, bands: Bands, seed: u64) -> Candidate {
    Candidate {
        id: id.to_string(),
        substance: None,
        name: id.to_string(),
        library: "lab".to_string(),
        spectrum: spectrum(&[(bands, 1.0)], seed, 0.0),
    }
}

#[test]
fn two_components_are_found_and_nothing_is_left_at_realistic_noise() {
    let pool = vec![
        candidate("alfa", ALFA, 1),
        candidate("beta", BETA, 2),
        candidate("gamma", GAMMA, 3),
    ];
    let (th, cuts, pk) = (
        Thresholds::embedded().unwrap(),
        Cuts::embedded().unwrap(),
        peaks::Thresholds::embedded().unwrap(),
    );
    for noise in [0.005, 0.01, 0.02] {
        for seed in [21u64, 22, 23] {
            let sample = spectrum(&[(BETA, 0.7), (ALFA, 0.3)], seed, noise);
            let m = analyze(&sample, &pool, &th, &cuts, &pk).unwrap();
            let mut ids: Vec<&str> = m.components.iter().map(|c| c.id.as_str()).collect();
            ids.sort_unstable();
            assert_eq!(ids, ["alfa", "beta"], "noise {noise} seed {seed}");
            assert!(
                m.unexplained_peaks.is_empty(),
                "noise {noise} seed {seed}: {:?}",
                m.unexplained_peaks
            );
            assert!(m.alerts.is_empty(), "noise {noise} seed {seed}");
            let beta = m.components.iter().find(|c| c.id == "beta").unwrap();
            assert!(
                beta.contribution > 0.6 && beta.contribution < 0.85,
                "noise {noise} seed {seed}: {}",
                beta.contribution
            );
        }
    }
}
