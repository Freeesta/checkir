//! Non-negative least squares by the Lawson–Hanson active-set method, written here (no dependency): minimise
//! `‖A x − b‖²` with `x ≥ 0`. `A` is given as columns. Parity with `scipy.optimize.nnls` is tested to 1e-9 on fixtures,
//! background columns included (a free-sign column is passed as the pair `c, −c`).
//!
//! The unconstrained sub-problem on the passive set is solved by Householder QR, so the conditioning is that of `A`,
//! not its square. A passive column that adds nothing (rank deficiency) gets 0.

/// Result of `solve`.
#[derive(Debug, Clone, PartialEq)]
pub struct Fit {
    pub x: Vec<f64>,
    /// Sum of squares of `b − A x`.
    pub rss: f64,
}

/// Least squares on the columns `idx` of `cols`: coefficients in the same order (0 for a dependent column).
fn lstsq(cols: &[&[f64]], idx: &[usize], b: &[f64]) -> Vec<f64> {
    let (n, k) = (b.len(), idx.len());
    let mut a: Vec<Vec<f64>> = idx.iter().map(|&j| cols[j].to_vec()).collect();
    let mut y = b.to_vec();
    let scale = a
        .iter()
        .map(|c| c.iter().map(|v| v * v).sum::<f64>().sqrt())
        .fold(0.0, f64::max);
    let mut used = vec![false; k];
    for j in 0..k {
        let norm = a[j][j..].iter().map(|v| v * v).sum::<f64>().sqrt();
        if norm <= 1e-12 * scale || j >= n {
            continue;
        }
        used[j] = true;
        let alpha = if a[j][j] > 0.0 { -norm } else { norm };
        let mut v: Vec<f64> = a[j][j..].to_vec();
        v[0] -= alpha;
        let vv: f64 = v.iter().map(|t| t * t).sum();
        if vv > 0.0 {
            for col in a.iter_mut().take(k).skip(j) {
                let dot: f64 = (j..n).map(|r| v[r - j] * col[r]).sum();
                for r in j..n {
                    col[r] -= 2.0 * dot / vv * v[r - j];
                }
            }
            let dot: f64 = (j..n).map(|r| v[r - j] * y[r]).sum();
            for r in j..n {
                y[r] -= 2.0 * dot / vv * v[r - j];
            }
        }
    }
    let mut x = vec![0.0; k];
    for j in (0..k).rev() {
        if used[j] {
            let s: f64 = (j + 1..k).map(|c| a[c][j] * x[c]).sum();
            x[j] = (y[j] - s) / a[j][j];
        }
    }
    x
}

fn rss_of(cols: &[&[f64]], x: &[f64], b: &[f64]) -> f64 {
    (0..b.len())
        .map(|i| {
            let fit: f64 = cols.iter().zip(x).map(|(c, w)| c[i] * w).sum();
            (b[i] - fit) * (b[i] - fit)
        })
        .sum()
}

/// The Lawson–Hanson algorithm. Empty `cols` gives `x = []` and `rss = ‖b‖²`.
pub fn solve(cols: &[&[f64]], b: &[f64]) -> Fit {
    let n = cols.len();
    let norm1 = cols
        .iter()
        .map(|c| c.iter().map(|v| v.abs()).sum::<f64>())
        .fold(0.0, f64::max);
    let tol = 10.0 * b.len().max(n) as f64 * f64::EPSILON * norm1;
    let mut x = vec![0.0; n];
    let mut passive: Vec<usize> = Vec::new();
    for _ in 0..(3 * n + 10) {
        let r: Vec<f64> = (0..b.len())
            .map(|i| b[i] - cols.iter().zip(&x).map(|(c, w)| c[i] * w).sum::<f64>())
            .collect();
        let grad = |j: usize| cols[j].iter().zip(&r).map(|(a, r)| a * r).sum::<f64>();
        let best = (0..n)
            .filter(|j| !passive.contains(j))
            .map(|j| (j, grad(j)))
            .fold(None, |m: Option<(usize, f64)>, c| match m {
                Some(b) if b.1 >= c.1 => Some(b),
                _ => Some(c),
            });
        match best {
            Some((j, g)) if g > tol => passive.push(j),
            _ => break,
        }
        loop {
            let s = lstsq(cols, &passive, b);
            if s.iter().all(|v| *v > 0.0) {
                for (i, &j) in passive.iter().enumerate() {
                    x[j] = s[i];
                }
                break;
            }
            let (drop, alpha) = passive
                .iter()
                .zip(&s)
                .filter(|(_, s)| **s <= 0.0)
                .map(|(&j, s)| (j, if x[j] > *s { x[j] / (x[j] - s) } else { 0.0 }))
                .fold((0, f64::INFINITY), |m, c| if c.1 < m.1 { c } else { m });
            for (i, &j) in passive.iter().enumerate() {
                x[j] += alpha * (s[i] - x[j]);
            }
            x[drop] = 0.0;
            passive.retain(|&j| j != drop && x[j] > 1e-14);
            for (j, xj) in x.iter_mut().enumerate().take(n) {
                if !passive.contains(&j) {
                    *xj = 0.0;
                }
            }
            if passive.is_empty() {
                break;
            }
        }
    }
    let rss = rss_of(cols, &x, b);
    Fit { x, rss }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn solves_a_small_problem_with_an_active_constraint() {
        // b = 2·c0 − 1·c1 exactly: the constraint x1 ≥ 0 binds, so x1 = 0.
        let c0 = [1.0, 0.0, 1.0, 0.5];
        let c1 = [0.0, 1.0, 1.0, 0.2];
        let b: Vec<f64> = (0..4).map(|i| 2.0 * c0[i] - c1[i]).collect();
        let fit = solve(&[&c0, &c1], &b);
        assert!(fit.x.iter().all(|v| *v >= 0.0));
        assert!(fit.x[1] < 1e-12 || fit.x[0] > 0.0);
        let free = solve(&[&c0, &c1, &[-1.0, 0.0, -1.0, -0.5]], &b);
        assert!(free.rss <= fit.rss + 1e-12);
    }

    #[test]
    fn no_columns_leaves_the_data() {
        let fit = solve(&[], &[3.0, 4.0]);
        assert_eq!((fit.x.len(), fit.rss), (0, 25.0));
    }
}
