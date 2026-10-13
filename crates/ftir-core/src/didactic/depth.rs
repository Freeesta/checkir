//! Penetration depth of the evanescent wave in ATR: dp = lambda / (2 pi n1 sqrt(sin^2 theta - (n2/n1)^2)).

use super::check_positive;
use crate::error::{EngineError, EngineResult};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Depth {
    pub wavelength_um: f64,
    pub depth_um: f64,
    pub critical_angle_deg: f64,
}

/// Critical angle (degrees) for a crystal of index `n_crystal` against a sample of index `n_sample`.
pub fn critical_angle_deg(n_crystal: f64, n_sample: f64) -> EngineResult<f64> {
    let n1 = check_positive("n_crystal", n_crystal)?;
    let n2 = check_positive("n_sample", n_sample)?;
    if n2 >= n1 {
        return Err(EngineError::new(
            "didactic.no_total_reflection",
            "the sample index must be lower than the crystal index",
        )
        .with_param("n_crystal", n1)
        .with_param("n_sample", n2));
    }
    Ok((n2 / n1).asin().to_degrees())
}

/// Penetration depth in micrometres at `wavenumber_cm1` for the angle of incidence `angle_deg`.
/// Below the critical angle there is no evanescent wave: error `didactic.below_critical_angle`.
pub fn penetration_depth(
    wavenumber_cm1: f64,
    n_crystal: f64,
    n_sample: f64,
    angle_deg: f64,
) -> EngineResult<Depth> {
    let nu = check_positive("wavenumber_cm1", wavenumber_cm1)?;
    let critical = critical_angle_deg(n_crystal, n_sample)?;
    if !(angle_deg.is_finite() && angle_deg > 0.0 && angle_deg <= 90.0) {
        return Err(EngineError::new(
            "didactic.invalid_angle",
            "the angle must be in (0, 90] degrees",
        )
        .with_param("angle_deg", angle_deg));
    }
    if angle_deg <= critical {
        return Err(EngineError::new(
            "didactic.below_critical_angle",
            "the angle is not above the critical angle: total reflection does not occur",
        )
        .with_param("angle_deg", angle_deg)
        .with_param("critical_angle_deg", format!("{critical:.2}")));
    }
    let s = angle_deg.to_radians().sin();
    let ratio = n_sample / n_crystal;
    let wavelength_um = 1.0e4 / nu;
    let depth_um =
        wavelength_um / (2.0 * std::f64::consts::PI * n_crystal * (s * s - ratio * ratio).sqrt());
    Ok(Depth {
        wavelength_um,
        depth_um,
        critical_angle_deg: critical,
    })
}
