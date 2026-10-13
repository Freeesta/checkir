//! Whittaker smoother and the iterative reweighting schemes built on it (AsLS, arPLS), after `pybaselines`.
//!
//! The baseline `z` minimises `Σ wᵢ (yᵢ − zᵢ)² + λ Σ (Δᵈ z)²`, i.e. solves `(W + λ DᵀD) z = W y` with `D` the
//! `d`-th order difference matrix. The system is symmetric positive definite with bandwidth `d`, solved by a banded
//! Cholesky factorisation. Indices are positions in the run, not wavenumbers: the grid must be uniform.

/// Largest difference order accepted.
pub const MAX_ORDER: usize = 3;

fn binomial_signs(d: usize) -> Vec<f64> {
    let mut c = vec![1.0];
    for _ in 0..d {
        let mut next = vec![0.0; c.len() + 1];
        for (i, v) in c.iter().enumerate() {
            next[i] += -v;
            next[i + 1] += *v;
        }
        c = next;
    }
    c
}

/// Solve `(diag(w) + λ DᵀD) z = w·y` for the `d`-th order difference matrix.
pub fn solve(y: &[f64], w: &[f64], lambda: f64, d: usize) -> Vec<f64> {
    let n = y.len();
    let width = d + 1;
    let coef = binomial_signs(d);
    // Lower band storage: a[i * width + (i - j)] = A[i][j].
    let mut a = vec![0.0; n * width];
    for r in 0..n - d {
        for (p, cp) in coef.iter().enumerate() {
            for (q, cq) in coef.iter().enumerate().take(p + 1) {
                a[(r + p) * width + (p - q)] += lambda * cp * cq;
            }
        }
    }
    for (i, wi) in w.iter().enumerate() {
        a[i * width] += wi;
    }
    for i in 0..n {
        for j in i.saturating_sub(d)..=i {
            let from = i.saturating_sub(d).max(j.saturating_sub(d));
            let dot: f64 = (from..j)
                .map(|m| a[i * width + (i - m)] * a[j * width + (j - m)])
                .sum();
            let v = a[i * width + (i - j)] - dot;
            a[i * width + (i - j)] = if i == j { v.sqrt() } else { v / a[j * width] };
        }
    }
    let mut z: Vec<f64> = y.iter().zip(w).map(|(y, w)| y * w).collect();
    for i in 0..n {
        let dot: f64 = (i.saturating_sub(d)..i)
            .map(|m| a[i * width + (i - m)] * z[m])
            .sum();
        z[i] = (z[i] - dot) / a[i * width];
    }
    for i in (0..n).rev() {
        let dot: f64 = (i + 1..(i + d + 1).min(n))
            .map(|m| a[m * width + (m - i)] * z[m])
            .sum();
        z[i] = (z[i] - dot) / a[i * width];
    }
    z
}

fn norm(v: impl Iterator<Item = f64>) -> f64 {
    v.map(|x| x * x).sum::<f64>().sqrt()
}

fn relative_difference(old: &[f64], new: &[f64]) -> f64 {
    norm(old.iter().zip(new).map(|(o, n)| n - o)) / norm(old.iter().copied()).max(f64::EPSILON)
}

/// AsLS weights: `p` above the baseline, `1 − p` below or on it.
fn asls_weights(y: &[f64], z: &[f64], p: f64) -> Vec<f64> {
    y.iter()
        .zip(z)
        .map(|(y, z)| if y > z { p } else { 1.0 - p })
        .collect()
}

/// arPLS weights (Baek 2015); `None` when fewer than two points lie below the baseline (the loop then stops).
fn arpls_weights(y: &[f64], z: &[f64]) -> Option<Vec<f64>> {
    let neg: Vec<f64> = y
        .iter()
        .zip(z)
        .map(|(y, z)| y - z)
        .filter(|r| *r < 0.0)
        .collect();
    if neg.len() < 2 {
        return None;
    }
    let mean = neg.iter().sum::<f64>() / neg.len() as f64;
    let var = neg.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (neg.len() - 1) as f64;
    let std = if var.sqrt() > 0.0 {
        var.sqrt()
    } else {
        f64::EPSILON
    };
    let m = 2.0 * std - mean;
    Some(
        y.iter()
            .zip(z)
            .map(|(y, z)| 1.0 / (1.0 + ((2.0 / std) * ((y - z) - m)).exp()))
            .collect(),
    )
}

/// Iterate the weights until the relative change drops below `tol` (at most `max_iter + 1` solves, as `pybaselines`).
fn iterate(
    y: &[f64],
    lambda: f64,
    d: usize,
    max_iter: usize,
    tol: f64,
    next: impl Fn(&[f64], &[f64]) -> Option<Vec<f64>>,
) -> Vec<f64> {
    let mut w = vec![1.0; y.len()];
    let mut z = Vec::new();
    for _ in 0..=max_iter {
        z = solve(y, &w, lambda, d);
        let Some(nw) = next(y, &z) else { break };
        let done = relative_difference(&w, &nw) < tol;
        if done {
            break;
        }
        w = nw;
    }
    z
}

/// Asymmetric least squares baseline (Eilers–Boelens).
pub fn asls(y: &[f64], lambda: f64, p: f64, d: usize, max_iter: usize, tol: f64) -> Vec<f64> {
    iterate(y, lambda, d, max_iter, tol, |y, z| {
        Some(asls_weights(y, z, p))
    })
}

/// Asymmetrically reweighted penalised least squares baseline (Baek 2015).
pub fn arpls(y: &[f64], lambda: f64, d: usize, max_iter: usize, tol: f64) -> Vec<f64> {
    iterate(y, lambda, d, max_iter, tol, arpls_weights)
}
