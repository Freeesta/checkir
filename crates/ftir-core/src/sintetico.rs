//! Deterministic synthetic spectra with known truth: Lorentz bands on a cm⁻¹ grid, baseline, seeded noise.
use crate::spettro::{Ruolo, Spettro, UnitaY};

/// One Lorentzian band (position and half width in cm⁻¹, height in absorbance units).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Banda {
    pub centro_cm1: f64,
    pub semilarghezza_cm1: f64,
    pub altezza: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Parametri {
    pub da_cm1: f64,
    pub a_cm1: f64,
    pub passo_cm1: f64,
    pub bande: Vec<Banda>,
    /// Baseline `offset + pendenza * (x - da) / (a - da)`.
    pub base_offset: f64,
    pub base_pendenza: f64,
    pub rumore: f64,
    pub seme: u64,
}

impl Parametri {
    /// Small fixed case used by the conformance tests and the demo chart.
    pub fn prova() -> Self {
        Parametri {
            da_cm1: 4000.0,
            a_cm1: 400.0,
            passo_cm1: 4.0,
            bande: vec![
                Banda {
                    centro_cm1: 2920.0,
                    semilarghezza_cm1: 25.0,
                    altezza: 0.8,
                },
                Banda {
                    centro_cm1: 1715.0,
                    semilarghezza_cm1: 12.0,
                    altezza: 1.0,
                },
                Banda {
                    centro_cm1: 1450.0,
                    semilarghezza_cm1: 15.0,
                    altezza: 0.4,
                },
                Banda {
                    centro_cm1: 1100.0,
                    semilarghezza_cm1: 30.0,
                    altezza: 0.6,
                },
                Banda {
                    centro_cm1: 700.0,
                    semilarghezza_cm1: 10.0,
                    altezza: 0.3,
                },
            ],
            base_offset: 0.02,
            base_pendenza: 0.05,
            rumore: 0.002,
            seme: 42,
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
    fn simmetrico(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 52) as f64 - 1.0
    }
}

/// Value of the noise-free signal (bands plus baseline) at one wavenumber.
pub fn valore_vero(p: &Parametri, x: f64) -> f64 {
    let t = (x - p.da_cm1) / (p.a_cm1 - p.da_cm1);
    let bande: f64 = p
        .bande
        .iter()
        .map(|b| {
            let d = (x - b.centro_cm1) / b.semilarghezza_cm1;
            b.altezza / (1.0 + d * d)
        })
        .sum();
    bande + p.base_offset + p.base_pendenza * t
}

/// Generate the spectrum (descending axis from `da_cm1` to `a_cm1`, as FTIR instruments export it).
pub fn genera(p: &Parametri) -> Spettro {
    let n = ((p.da_cm1 - p.a_cm1).abs() / p.passo_cm1).floor() as usize + 1;
    let segno = if p.a_cm1 < p.da_cm1 { -1.0 } else { 1.0 };
    let mut rng = Rng(p.seme);
    let mut x = Vec::with_capacity(n);
    let mut y = Vec::with_capacity(n);
    for i in 0..n {
        let xi = p.da_cm1 + segno * p.passo_cm1 * i as f64;
        x.push(xi);
        y.push(valore_vero(p, xi) + p.rumore * rng.simmetrico());
    }
    Spettro::new(Ruolo::Campione, UnitaY::Assorbanza, x, y)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn same_seed_same_spectrum() {
        assert_eq!(genera(&Parametri::prova()), genera(&Parametri::prova()));
    }

    #[test]
    fn grid_is_descending_and_complete() {
        let s = genera(&Parametri::prova());
        assert_eq!(s.len(), 901);
        assert_eq!(s.numero_onda_cm1[0], 4000.0);
        assert_eq!(s.numero_onda_cm1[900], 400.0);
    }

    #[test]
    fn noise_is_bounded_and_peak_is_where_declared() {
        let p = Parametri::prova();
        let s = genera(&p);
        for (x, y) in s.numero_onda_cm1.iter().zip(&s.y) {
            assert!((y - valore_vero(&p, *x)).abs() <= p.rumore);
        }
        let i = s
            .numero_onda_cm1
            .iter()
            .position(|x| (*x - 1715.0).abs() < 2.0)
            .unwrap();
        assert!(s.y[i] > 0.9);
    }

    #[test]
    fn different_seed_differs() {
        let mut p = Parametri::prova();
        let a = genera(&p);
        p.seme = 7;
        assert_ne!(a.y, genera(&p).y);
    }

    #[test]
    fn lorentz_half_height_at_half_width() {
        let p = Parametri {
            bande: vec![Banda {
                centro_cm1: 1000.0,
                semilarghezza_cm1: 10.0,
                altezza: 1.0,
            }],
            base_offset: 0.0,
            base_pendenza: 0.0,
            ..Parametri::prova()
        };
        assert!((valore_vero(&p, 1010.0) - 0.5).abs() < 1e-12);
    }
}
