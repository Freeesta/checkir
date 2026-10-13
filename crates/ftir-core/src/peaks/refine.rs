//! From a maximum found on a run to a candidate with a position, a width and a prominence in physical units.
//! Position: three-point parabola for narrow bands, centroid above half height for wide ones (a parabola on a flat top
//! jumps with the noise).
use super::find::Found;
use super::result::{Artifact, Kind};

/// A candidate before classes, ids and regions are decided.
#[derive(Debug, Clone, PartialEq)]
pub struct Cand {
    pub position: f64,
    pub height: f64,
    pub prominence: f64,
    pub fwhm: Option<f64>,
    pub kind: Kind,
    pub artifact: Option<Artifact>,
}

/// Axis step of a run (the grid is ascending and uniform).
pub fn step(x: &[f64]) -> f64 {
    x[1] - x[0]
}

/// Offset in samples (−1 ..= 1) of the vertex of the parabola through `i − 1`, `i`, `i + 1`; 0 on a flat top.
pub fn vertex_offset(y: &[f64], i: usize) -> f64 {
    let den = y[i - 1] - 2.0 * y[i] + y[i + 1];
    if den == 0.0 || !den.is_finite() {
        return 0.0;
    }
    (0.5 * (y[i - 1] - y[i + 1]) / den).clamp(-1.0, 1.0)
}

/// Index of the valley bottom reached from `from` stepping by `dir` (±1) up to `limit`: the lowest point before the signal
/// climbs back by more than `tol`.
fn valley(y: &[f64], from: usize, dir: isize, limit: usize, tol: f64) -> usize {
    let (mut best, mut j) = (from, from);
    while j != limit {
        j = (j as isize + dir) as usize;
        if y[j] < y[best] {
            best = j;
        } else if y[j] - y[best] > tol {
            break;
        }
    }
    best
}

/// Centroid of the part of the band above the width line, `None` when no point lies above it. The window is symmetric
/// around the maximum and stops at the nearer valley (climbs of more than `tol` count as a neighbour), so a close
/// neighbour cannot drag the centroid.
pub fn centroid(x: &[f64], y: &[f64], f: &Found, tol: f64) -> Option<f64> {
    let from = f.left_ip.ceil().max(0.0) as usize;
    let to = (f.right_ip.floor() as usize).min(y.len() - 1);
    let i = f.index;
    let d = (i - valley(y, i, -1, from.min(i), tol)).min(valley(y, i, 1, to.max(i), tol) - i);
    let (mut sum, mut weight) = (0.0, 0.0);
    for j in i - d.min(i)..=(i + d).min(y.len() - 1) {
        let w = y[j] - f.width_height;
        if w > 0.0 {
            sum += x[j] * w;
            weight += w;
        }
    }
    (weight > 0.0).then(|| sum / weight)
}

/// Position of a maximum: centroid when the width reaches `centroid_from`, otherwise the parabola.
pub fn position(x: &[f64], y: &[f64], f: &Found, centroid_from: f64, tol: f64) -> f64 {
    let parabola = x[f.index] + vertex_offset(y, f.index) * step(x);
    if f.width * step(x) >= centroid_from {
        centroid(x, y, f, tol).unwrap_or(parabola)
    } else {
        parabola
    }
}

/// The candidate of a maximum found on the run `(x, y)`.
pub fn candidate(x: &[f64], y: &[f64], f: &Found, centroid_from: f64, tol: f64) -> Cand {
    Cand {
        position: position(x, y, f, centroid_from, tol),
        height: y[f.index],
        prominence: f.prominence,
        fwhm: Some(f.width * step(x)),
        kind: Kind::Peak,
        artifact: None,
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::peaks::find::find_peaks;

    fn lorentz(c: f64, hw: f64) -> (Vec<f64>, Vec<f64>) {
        let x: Vec<f64> = (0..300).map(|i| 1500.0 + 2.0 * f64::from(i)).collect();
        let y = x
            .iter()
            .map(|v| 1.0 / (1.0 + ((v - c) / hw).powi(2)))
            .collect();
        (x, y)
    }

    #[test]
    fn parabola_finds_a_centre_between_samples_and_the_width() {
        let (x, y) = lorentz(1801.3, 10.0);
        let f = &find_peaks(&y, 0.1, 2, 0.5)[0];
        let c = candidate(&x, &y, f, 20.0, 0.001);
        assert!((c.position - 1801.3).abs() < 0.5, "{}", c.position);
        assert!((c.fwhm.expect("fwhm") - 20.0).abs() < 1.0, "{:?}", c.fwhm);
    }

    #[test]
    fn centroid_is_used_for_wide_bands() {
        let (x, y) = lorentz(1900.0, 40.0);
        let f = &find_peaks(&y, 0.1, 2, 0.5)[0];
        assert!((position(&x, &y, f, 20.0, 0.001) - 1900.0).abs() < 0.5);
    }
}
