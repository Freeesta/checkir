//! Hooke's law for a diatomic bond: wavenumber = sqrt(k / mu) / (2 pi c).

use super::check_positive;
use crate::error::EngineResult;

/// Atomic mass unit in kg (CODATA 2018).
pub const AMU_KG: f64 = 1.660_539_066_60e-27;
/// Speed of light in cm/s.
pub const LIGHT_SPEED_CM_S: f64 = 2.997_924_58e10;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Spring {
    pub reduced_mass_u: f64,
    pub wavenumber_cm1: f64,
}

/// Reduced mass m1*m2/(m1+m2) in the unit of the inputs.
pub fn reduced_mass(mass_a_u: f64, mass_b_u: f64) -> EngineResult<f64> {
    let a = check_positive("mass_a_u", mass_a_u)?;
    let b = check_positive("mass_b_u", mass_b_u)?;
    Ok(a * b / (a + b))
}

/// Vibration wavenumber (cm-1) of two masses (u) joined by a spring of force constant `k_n_m` (N/m).
pub fn spring(k_n_m: f64, mass_a_u: f64, mass_b_u: f64) -> EngineResult<Spring> {
    let k = check_positive("k_n_m", k_n_m)?;
    let mu = reduced_mass(mass_a_u, mass_b_u)?;
    let omega = (k / (mu * AMU_KG)).sqrt();
    Ok(Spring {
        reduced_mass_u: mu,
        wavenumber_cm1: omega / (2.0 * std::f64::consts::PI * LIGHT_SPEED_CM_S),
    })
}
