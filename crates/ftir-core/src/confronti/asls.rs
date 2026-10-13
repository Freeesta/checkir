//! Asymmetric least squares baseline (Eilers & Boelens), the baseline of `pearson_spettro/1`.
//!
//! Minimises Σ wᵢ(yᵢ − zᵢ)² + λ Σ (Δ²zᵢ)² and reweights (wᵢ = p above the baseline, 1 − p below) until the relative
//! change of the weights drops under `tol`. Same iteration as `pybaselines.Baseline.asls` (parity test on fixtures).
//! Absent points (`NaN`) get weight 0, so the baseline bridges them smoothly.

/// Parameters of the baseline; stored in the result with the chain.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Asls {
    pub lam: f64,
    pub p: f64,
    pub max_iter: usize,
    pub tol: f64,
}

pub const DEFAULT: Asls = Asls {
    lam: 1e7,
    p: 0.01,
    max_iter: 50,
    tol: 1e-3,
};

/// Pentadiagonal LDLᵀ factorisation of `diag(w) + λ·D₂ᵀD₂` and solve; `d`, `l1`, `l2` are scratch of length n.
fn solve(w: &[f64], rhs: &[f64], lam: f64, out: &mut [f64], work: &mut [Vec<f64>; 3]) {
    let n = w.len();
    let [d, l1, l2] = work;
    let main = |i: usize| match i.min(n - 1 - i) {
        0 => 1.0,
        1 => 5.0,
        _ => 6.0,
    };
    let off1 = |i: usize| if i == 0 || i + 2 == n { -2.0 } else { -4.0 };
    for i in 0..n {
        let a0 = w[i] + lam * main(i);
        let prev1 = if i >= 1 {
            l1[i - 1] * l1[i - 1] * d[i - 1]
        } else {
            0.0
        };
        let prev2 = if i >= 2 {
            l2[i - 2] * l2[i - 2] * d[i - 2]
        } else {
            0.0
        };
        d[i] = a0 - prev1 - prev2;
        if i + 1 < n {
            let carry = if i >= 1 {
                l2[i - 1] * l1[i - 1] * d[i - 1]
            } else {
                0.0
            };
            l1[i] = (lam * off1(i) - carry) / d[i];
        }
        if i + 2 < n {
            l2[i] = lam / d[i];
        }
    }
    for i in 0..n {
        let a = if i >= 1 { l1[i - 1] * out[i - 1] } else { 0.0 };
        let b = if i >= 2 { l2[i - 2] * out[i - 2] } else { 0.0 };
        out[i] = rhs[i] - a - b;
    }
    for i in (0..n).rev() {
        let a = if i + 1 < n { l1[i] * out[i + 1] } else { 0.0 };
        let b = if i + 2 < n { l2[i] * out[i + 2] } else { 0.0 };
        out[i] = out[i] / d[i] - a - b;
    }
}

/// The baseline of `y` (same length); `NaN` in `y` stays `NaN` in the result. `None` with fewer than 5 points present.
pub fn baseline(y: &[f64], par: &Asls) -> Option<Vec<f64>> {
    let n = y.len();
    let present: Vec<bool> = y.iter().map(|v| v.is_finite()).collect();
    if present.iter().filter(|p| **p).count() < 5 {
        return None;
    }
    let yy: Vec<f64> = y
        .iter()
        .map(|v| if v.is_finite() { *v } else { 0.0 })
        .collect();
    let mut w: Vec<f64> = present.iter().map(|p| if *p { 1.0 } else { 0.0 }).collect();
    let mut work = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    let (mut z, mut rhs) = (vec![0.0; n], vec![0.0; n]);
    for _ in 0..=par.max_iter {
        for i in 0..n {
            rhs[i] = w[i] * yy[i];
        }
        solve(&w, &rhs, par.lam, &mut z, &mut work);
        let (mut diff, mut norm) = (0.0, 0.0);
        for i in 0..n {
            let new = match (present[i], yy[i] > z[i]) {
                (false, _) => 0.0,
                (true, true) => par.p,
                (true, false) => 1.0 - par.p,
            };
            diff += (new - w[i]).abs();
            norm += w[i].abs();
            rhs[i] = new;
        }
        if diff / norm < par.tol {
            break;
        }
        w.copy_from_slice(&rhs);
    }
    Some(
        z.iter()
            .zip(&present)
            .map(|(v, p)| if *p { *v } else { f64::NAN })
            .collect(),
    )
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn a_straight_line_under_a_peak_is_found() {
        let y: Vec<f64> = (0..200)
            .map(|i| {
                let x = f64::from(i);
                0.5 + 0.002 * x + 1.0 / (1.0 + ((x - 100.0) / 4.0).powi(2))
            })
            .collect();
        let z = baseline(&y, &DEFAULT).expect("baseline");
        assert!((z[10] - (0.5 + 0.02)).abs() < 0.02, "{}", z[10]);
        assert!(z[100] < 0.9, "baseline follows the peak: {}", z[100]);
        assert!(z.iter().zip(&y).all(|(b, v)| *b <= *v + 0.05));
    }

    #[test]
    fn absent_points_stay_absent_and_few_points_give_none() {
        let mut y = vec![1.0; 30];
        y[3] = f64::NAN;
        let z = baseline(&y, &DEFAULT).expect("baseline");
        assert!(z[3].is_nan() && (z[4] - 1.0).abs() < 1e-6);
        assert!(baseline(&[1.0, 2.0, f64::NAN], &DEFAULT).is_none());
    }
}
