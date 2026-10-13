//! `savitzky_golay/1`: smoothing (`deriv` 0) or derivative (1, 2) by local polynomial fit, as
//! `scipy.signal.savgol_filter(..., mode="interp")`: inside, the fixed filter; the first and last half window are the
//! fitted polynomial of the first / last `window` points, evaluated there. The derivative is with respect to cm⁻¹
//! (index step divided by the axis step, signed like the axis). Each run of present points is filtered on its own;
//! a run shorter than the window becomes absent. The axis of a run must be uniform (relative tolerance 1e-6).
//! Defaults: polynomial order 3, window 15 points, derivative 1.
use super::{finite_axis, int, invalid, obj, params, result, Value};
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "savitzky_golay",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"window":"odd integer >= 3","polyorder":"integer < window","deriv":"0, 1 or 2, <= polyorder"}"#,
    defaults: r#"{"window":15,"polyorder":3,"deriv":1}"#,
    inverse: None,
};

/// Solve `a x = b` by Gaussian elimination with partial pivoting (small dense systems).
pub(crate) fn solve(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Vec<f64> {
    let n = b.len();
    for c in 0..n {
        let piv = (c..n)
            .max_by(|i, j| a[*i][c].abs().total_cmp(&a[*j][c].abs()))
            .unwrap_or(c);
        a.swap(c, piv);
        b.swap(c, piv);
        for r in c + 1..n {
            let f = a[r][c] / a[c][c];
            let pivot_row = a[c].clone();
            for (v, p) in a[r][c..].iter_mut().zip(&pivot_row[c..]) {
                *v -= f * p;
            }
            b[r] -= f * b[c];
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let s: f64 = (r + 1..n).map(|k| a[r][k] * x[k]).sum();
        x[r] = (b[r] - s) / a[r][r];
    }
    x
}

/// Normal matrix `VᵀV` of the Vandermonde matrix `V[j][i] = (j - m)^i` for `w = 2m + 1` points.
fn normal(w: usize, order: usize) -> Vec<Vec<f64>> {
    let m = (w / 2) as f64;
    (0..=order)
        .map(|r| {
            (0..=order)
                .map(|c| (0..w).map(|j| (j as f64 - m).powi((r + c) as i32)).sum())
                .collect()
        })
        .collect()
}

fn factorial(n: usize) -> f64 {
    (1..=n).map(|k| k as f64).product()
}

/// Fixed filter weights for the centre point.
fn weights(w: usize, order: usize, deriv: usize) -> Vec<f64> {
    let mut e = vec![0.0; order + 1];
    e[deriv] = 1.0;
    let z = solve(normal(w, order), e);
    let m = (w / 2) as f64;
    (0..w)
        .map(|j| {
            factorial(deriv)
                * (0..=order)
                    .map(|i| z[i] * (j as f64 - m).powi(i as i32))
                    .sum::<f64>()
        })
        .collect()
}

/// Polynomial coefficients (in powers of `j - m`) fitted to `ys`, and their `deriv`-th derivative at `t`.
fn edge_value(ys: &[f64], order: usize, deriv: usize, t: f64) -> f64 {
    let w = ys.len();
    let m = (w / 2) as f64;
    let rhs: Vec<f64> = (0..=order)
        .map(|i| {
            ys.iter()
                .enumerate()
                .map(|(j, y)| y * (j as f64 - m).powi(i as i32))
                .sum()
        })
        .collect();
    let c = solve(normal(w, order), rhs);
    (deriv..=order)
        .map(|i| c[i] * factorial(i) / factorial(i - deriv) * t.powi((i - deriv) as i32))
        .sum()
}

fn filter_run(y: &[f64], w: usize, order: usize, deriv: usize, delta: f64) -> Vec<f64> {
    let m = w / 2;
    let wt = weights(w, order, deriv);
    let mut out = vec![0.0; y.len()];
    for k in m..y.len() - m {
        out[k] = wt.iter().zip(&y[k - m..=k + m]).map(|(a, b)| a * b).sum();
    }
    for k in 0..m {
        out[k] = edge_value(&y[..w], order, deriv, k as f64 - m as f64);
        let last = y.len() - 1 - k;
        out[last] = edge_value(
            &y[y.len() - w..],
            order,
            deriv,
            (w - 1 - k) as f64 - m as f64,
        );
    }
    let scale = delta.powi(deriv as i32);
    out.iter().map(|v| v / scale).collect()
}

/// Axis step of a run, or an error when the axis is not uniform.
fn uniform_step(x: &[f64]) -> EngineResult<f64> {
    let delta = (x[x.len() - 1] - x[0]) / (x.len() - 1) as f64;
    if delta == 0.0
        || x.windows(2)
            .any(|p| ((p[1] - p[0]) - delta).abs() > 1e-6 * delta.abs())
    {
        return Err(EngineError::new(
            "passi.griglia_non_uniforme",
            "the axis must be uniform (resample with griglia/1 first)",
        ));
    }
    Ok(delta)
}

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["window", "polyorder", "deriv"])?;
    let (w, order, deriv) = (
        int(&p, "window", 15)?,
        int(&p, "polyorder", 3)?,
        int(&p, "deriv", 1)?,
    );
    if w < 3 || w % 2 == 0 {
        return Err(invalid(
            "window",
            "expected an odd number of points, at least 3",
        ));
    }
    if order >= w {
        return Err(invalid("polyorder", "must be smaller than the window"));
    }
    if deriv > 2 || deriv > order {
        return Err(invalid("deriv", "expected 0, 1 or 2, not above polyorder"));
    }
    finite_axis(s)?;
    let mut y = vec![f64::NAN; s.len()];
    let mut start = 0;
    while start < s.len() {
        if !s.y[start].is_finite() {
            start += 1;
            continue;
        }
        let end = (start..s.len())
            .find(|i| !s.y[*i].is_finite())
            .unwrap_or(s.len());
        if end - start >= w {
            let delta = uniform_step(&s.wavenumber_cm1[start..end])?;
            y[start..end].copy_from_slice(&filter_run(&s.y[start..end], w, order, deriv, delta));
        }
        start = end;
    }
    let used = obj(vec![
        ("window", Value::Num(w as f64)),
        ("polyorder", Value::Num(order as f64)),
        ("deriv", Value::Num(deriv as f64)),
    ]);
    Ok(result(
        s,
        "savitzky_golay/1",
        &used,
        s.y_unit,
        s.wavenumber_cm1.clone(),
        y,
    ))
}
