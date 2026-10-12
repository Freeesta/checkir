//! Deterministic synthetic spectra with known truth: Lorentz bands on a cm⁻¹ grid, baseline, seeded noise.
use crate::spectrum::{Role, Spectrum, YUnit};

/// One Lorentzian band (position and half width in cm⁻¹, height in absorbance units).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Band {
    pub center_cm1: f64,
    pub half_width_cm1: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Params {
    pub from_cm1: f64,
    pub to_cm1: f64,
    pub step_cm1: f64,
    pub bands: Vec<Band>,
    /// Baseline `offset + slope * (x - from) / (to - from)`.
    pub baseline_offset: f64,
    pub baseline_slope: f64,
    pub noise: f64,
    pub seed: u64,
}

impl Params {
    /// Small fixed case used by the conformance tests and the demo chart.
    pub fn demo() -> Self {
        Params {
            from_cm1: 4000.0,
            to_cm1: 400.0,
            step_cm1: 4.0,
            bands: vec![
                Band {
                    center_cm1: 2920.0,
                    half_width_cm1: 25.0,
                    height: 0.8,
                },
                Band {
                    center_cm1: 1715.0,
                    half_width_cm1: 12.0,
                    height: 1.0,
                },
                Band {
                    center_cm1: 1450.0,
                    half_width_cm1: 15.0,
                    height: 0.4,
                },
                Band {
                    center_cm1: 1100.0,
                    half_width_cm1: 30.0,
                    height: 0.6,
                },
                Band {
                    center_cm1: 700.0,
                    half_width_cm1: 10.0,
                    height: 0.3,
                },
            ],
            baseline_offset: 0.02,
            baseline_slope: 0.05,
            noise: 0.002,
            seed: 42,
        }
    }
}

/// SplitMix64: tiny, fixed RNG written by hand so the sequence never depends on a library version.
struct Rng(u64);

impl Rng {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in [-1, 1).
    fn symmetric(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 52) as f64 - 1.0
    }
}

/// Value of the noise-free signal (bands plus baseline) at one wavenumber.
pub fn true_value(p: &Params, x: f64) -> f64 {
    let t = (x - p.from_cm1) / (p.to_cm1 - p.from_cm1);
    let bands: f64 = p
        .bands
        .iter()
        .map(|b| {
            let d = (x - b.center_cm1) / b.half_width_cm1;
            b.height / (1.0 + d * d)
        })
        .sum();
    bands + p.baseline_offset + p.baseline_slope * t
}

/// Generate the spectrum (descending axis from `from_cm1` to `to_cm1`, as FTIR instruments export it).
pub fn generate(p: &Params) -> Spectrum {
    let n = ((p.from_cm1 - p.to_cm1).abs() / p.step_cm1).floor() as usize + 1;
    let sign = if p.to_cm1 < p.from_cm1 { -1.0 } else { 1.0 };
    let mut rng = Rng(p.seed);
    let mut x = Vec::with_capacity(n);
    let mut y = Vec::with_capacity(n);
    for i in 0..n {
        let xi = p.from_cm1 + sign * p.step_cm1 * i as f64;
        x.push(xi);
        y.push(true_value(p, xi) + p.noise * rng.symmetric());
    }
    Spectrum::new(Role::Sample, YUnit::Absorbance, x, y)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn same_seed_same_spectrum() {
        assert_eq!(generate(&Params::demo()), generate(&Params::demo()));
    }

    #[test]
    fn grid_is_descending_and_complete() {
        let s = generate(&Params::demo());
        assert_eq!(s.len(), 901);
        assert_eq!(s.wavenumber_cm1[0], 4000.0);
        assert_eq!(s.wavenumber_cm1[900], 400.0);
    }

    #[test]
    fn noise_is_bounded_and_peak_is_where_declared() {
        let p = Params::demo();
        let s = generate(&p);
        for (x, y) in s.wavenumber_cm1.iter().zip(&s.y) {
            assert!((y - true_value(&p, *x)).abs() <= p.noise);
        }
        let i = s
            .wavenumber_cm1
            .iter()
            .position(|x| (*x - 1715.0).abs() < 2.0)
            .unwrap();
        assert!(s.y[i] > 0.9);
    }

    #[test]
    fn different_seed_differs() {
        let mut p = Params::demo();
        let a = generate(&p);
        p.seed = 7;
        assert_ne!(a.y, generate(&p).y);
    }

    #[test]
    fn lorentz_half_height_at_half_width() {
        let p = Params {
            bands: vec![Band {
                center_cm1: 1000.0,
                half_width_cm1: 10.0,
                height: 1.0,
            }],
            baseline_offset: 0.0,
            baseline_slope: 0.0,
            ..Params::demo()
        };
        assert!((true_value(&p, 1010.0) - 0.5).abs() < 1e-12);
    }
}
