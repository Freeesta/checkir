//! Bridge of the didactic engine (theory section): thin functions that return JSON text.
//! The calculation lives in `ftir_core::didactic`; errors are `{error, error_key, params}`.
use ftir_core::didactic::json;
use wasm_bindgen::prelude::*;

/// Hooke's law: `{reduced_mass_u, wavenumber_cm1}` for force constant `k_n_m` (N/m) and two masses (u).
#[wasm_bindgen]
pub fn didactic_spring(k_n_m: f64, mass_a_u: f64, mass_b_u: f64) -> String {
    json::spring_json(k_n_m, mass_a_u, mass_b_u).unwrap_or_else(|e| e.json())
}

/// ATR penetration depth: `{wavelength_um, depth_um, critical_angle_deg}`.
#[wasm_bindgen]
pub fn didactic_penetration_depth(
    wavenumber_cm1: f64,
    n_crystal: f64,
    n_sample: f64,
    angle_deg: f64,
) -> String {
    json::penetration_depth_json(wavenumber_cm1, n_crystal, n_sample, angle_deg)
        .unwrap_or_else(|e| e.json())
}

/// Single-beam ratio: `{transmittance[], absorbance[]}` (`null` = absent point).
#[wasm_bindgen]
pub fn didactic_ratio(sample: &[f64], background: &[f64]) -> String {
    json::ratio_json(sample, background).unwrap_or_else(|e| e.json())
}

/// Interferogram of lines/bands `[{wavenumber_cm1, amplitude, width_cm1?}]` with `2 * half_points + 1` samples.
#[wasm_bindgen]
pub fn didactic_interferogram_from_lines(
    lines_json: &str,
    half_points: u32,
    step_cm: f64,
) -> String {
    json::interferogram_from_lines_json(lines_json, half_points as usize, step_cm)
        .unwrap_or_else(|e| e.json())
}

/// Spectrum from an interferogram; `options_json` = `{opd_max_cm, apodization?, zero_fill?, output?}`.
#[wasm_bindgen]
pub fn didactic_spectrum_from_interferogram(
    intensity: &[f64],
    step_cm: f64,
    zpd_index: u32,
    options_json: &str,
) -> String {
    json::spectrum_from_interferogram_json(intensity, step_cm, zpd_index as usize, options_json)
        .unwrap_or_else(|e| e.json())
}

/// One period of a vibration mode in `frame_count` frames and its dipole: `atoms_json` =
/// `[{el, xyz, displacement, charge?}]` → `{frames[], dipole_change[], ir_active, momentum[]}`.
#[wasm_bindgen]
pub fn didactic_vibration_frames(atoms_json: &str, frame_count: u32) -> String {
    json::vibration_frames_json(atoms_json, frame_count as usize).unwrap_or_else(|e| e.json())
}

#[cfg(test)]
mod test {
    #[test]
    fn didactic_functions_return_data_or_error_keys() {
        assert!(super::didactic_spring(500.0, 12.0, 1.008).contains("\"wavenumber_cm1\":30"));
        let e = super::didactic_penetration_depth(1000.0, 2.4, 1.5, 30.0);
        assert!(
            e.contains("\"error_key\":\"didactic.below_critical_angle\""),
            "{e}"
        );
        let r = super::didactic_ratio(&[1.0], &[1.0, 2.0]);
        assert!(
            r.contains("\"error_key\":\"didactic.length_mismatch\""),
            "{r}"
        );
    }
}
