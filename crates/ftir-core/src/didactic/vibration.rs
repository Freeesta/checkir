//! A vibration mode of a few atoms: displaced positions over one period and the oscillating dipole.
//! A mode absorbs infrared only if the dipole moment changes during the vibration (the selection rule).

use super::{check_positive, MAX_POINTS};
use crate::error::{EngineError, EngineResult};

/// Atomic masses (u) of the elements used in the figures.
pub fn element_mass_u(symbol: &str) -> Option<f64> {
    Some(match symbol {
        "H" => 1.008,
        "C" => 12.011,
        "N" => 14.007,
        "O" => 15.999,
        "F" => 18.998,
        "S" => 32.06,
        "Cl" => 35.45,
        _ => return None,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct Atom {
    pub mass_u: f64,
    /// Partial charge (e), illustrative: it only sets the direction and size of the dipole in the figure.
    pub charge: f64,
    pub position: [f64; 3],
    /// Amplitude of the displacement of this mode (same length unit as `position`).
    pub displacement: [f64; 3],
}

#[derive(Debug, Clone, PartialEq)]
pub struct Frame {
    pub phase_rad: f64,
    pub positions: Vec<[f64; 3]>,
    pub dipole: [f64; 3],
}

fn sum_weighted(
    atoms: &[Atom],
    weight: impl Fn(&Atom) -> f64,
    vector: impl Fn(&Atom) -> [f64; 3],
) -> [f64; 3] {
    atoms.iter().fold([0.0; 3], |mut acc, a| {
        let (w, v) = (weight(a), vector(a));
        for k in 0..3 {
            acc[k] += w * v[k];
        }
        acc
    })
}

/// Sum of mass times displacement: zero for a free molecule (the centre of mass does not move).
pub fn momentum(atoms: &[Atom]) -> [f64; 3] {
    sum_weighted(atoms, |a| a.mass_u, |a| a.displacement)
}

/// Change of the dipole moment over the vibration: sum of charge times displacement (a vector).
pub fn dipole_change(atoms: &[Atom]) -> [f64; 3] {
    sum_weighted(atoms, |a| a.charge, |a| a.displacement)
}

pub fn norm(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

/// True when the dipole changes during the vibration (relative to the size of the charge movements).
pub fn is_ir_active(atoms: &[Atom]) -> bool {
    let scale: f64 = atoms
        .iter()
        .map(|a| a.charge.abs() * norm(a.displacement))
        .sum();
    scale > 0.0 && norm(dipole_change(atoms)) > 1e-9 * scale
}

/// Positions and dipole at `phase_rad`: position + displacement * sin(phase).
pub fn frame(atoms: &[Atom], phase_rad: f64) -> Frame {
    let s = phase_rad.sin();
    let positions: Vec<[f64; 3]> = atoms
        .iter()
        .map(|a| std::array::from_fn(|k| a.position[k] + a.displacement[k] * s))
        .collect();
    let dipole = sum_weighted(atoms, |a| a.charge, |a| a.position);
    let change = dipole_change(atoms);
    Frame {
        phase_rad,
        positions,
        dipole: std::array::from_fn(|k| dipole[k] + change[k] * s),
    }
}

/// `count` frames evenly spread over one period (phase 0 .. 2 pi, the last one excluded).
pub fn frames(atoms: &[Atom], count: usize) -> EngineResult<Vec<Frame>> {
    if atoms.is_empty() || count == 0 || count > 1024 || atoms.len() > MAX_POINTS {
        return Err(EngineError::new(
            "didactic.too_many_points",
            "the number of frames or atoms is out of range",
        )
        .with_param("limit", 1024));
    }
    for a in atoms {
        check_positive("mass_u", a.mass_u)?;
    }
    Ok((0..count)
        .map(|i| frame(atoms, std::f64::consts::TAU * i as f64 / count as f64))
        .collect())
}
