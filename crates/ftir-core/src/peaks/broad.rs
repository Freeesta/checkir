//! Broad bands (O-H, N-H⁺ of salts, water): looked for on a smoothed copy (Savitzky–Golay, 61 points = 122 cm⁻¹) and
//! reported as an interval at half height, not as a point. Narrow maxima on top of a broad band stay ordinary peaks.
//! The smoothed copy of a tall narrow peak is a low bump about as wide as the window, so a band counts only if enough of
//! the original points inside its interval lie above half height (`min_sustained_fraction`): a band holds its level, the
//! footprint of a single narrow peak does not.
use super::find::find_peaks;
use super::refine::{position, step};
use super::scan::runs;
use super::thresholds::Thresholds;
use crate::error::EngineResult;
use crate::passi::savitzky_golay;
use crate::spectrum::Spectrum;

#[derive(Debug, Clone, PartialEq)]
pub struct BroadCand {
    pub from: f64,
    pub to: f64,
    pub max: f64,
    pub prominence: f64,
}

/// Broad bands of `spec` (absorbance on the ascending grid after the baseline, excluded zones absent) whose prominence
/// on the smoothed copy is at least `min_prominence`.
pub fn find(spec: &Spectrum, min_prominence: f64, t: &Thresholds) -> EngineResult<Vec<BroadCand>> {
    let b = &t.broad;
    let params = format!(
        r#"{{"window":{},"polyorder":{},"deriv":0}}"#,
        b.smooth_window, b.smooth_polyorder
    );
    let smooth = savitzky_golay::apply(spec, &params)?.y;
    let mut out = Vec::new();
    for (a, z) in runs(&smooth) {
        let (x, ys, orig) = (&spec.wavenumber_cm1[a..z], &smooth[a..z], &spec.y[a..z]);
        if ys.len() < 3 {
            continue;
        }
        let dx = step(x);
        for f in find_peaks(ys, min_prominence, 1, t.detect.rel_height) {
            let inside =
                (f.left_ip.ceil() as usize)..=(f.right_ip.floor() as usize).min(ys.len() - 1);
            let total = inside.clone().count().max(1);
            let above = inside.filter(|j| orig[*j] >= f.width_height).count();
            if f.width * dx.abs() >= b.min_fwhm_cm1
                && above as f64 >= b.min_sustained_fraction * total as f64
            {
                out.push(BroadCand {
                    from: x[0] + f.left_ip * dx,
                    to: x[0] + f.right_ip * dx,
                    max: position(x, ys, &f, 0.0, 0.1 * min_prominence),
                    prominence: f.prominence,
                });
            }
        }
    }
    Ok(out)
}
