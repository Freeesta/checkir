//! Scoring of a query vector against matrix rows. `Selection` fixes the points that count (the query's present points,
//! outside the mask, inside the chosen ranges); mean and norm are recomputed on exactly those points, so a narrow range
//! is a true Pearson on that range. Rows present on the whole grid take the fast path: one fused pass over f32 data
//! accumulated in f64 (four lanes so the compiler can vectorise; the scalar loop is the fallback everywhere).
use super::{grid_x, masked, GRID_N};

/// The points that count in one comparison, and the query prepared for them.
#[derive(Debug, Clone)]
pub struct Selection {
    pub mask: Vec<bool>,
    pub count: usize,
    /// Every point outside the mask is selected (full range, query complete): rows centred over their own full set
    /// are already centred over this one and `r` is a plain dot product.
    pub full: bool,
    q: Vec<f64>,
    qc: Vec<f64>,
    w: Vec<f64>,
    flat: bool,
}

/// A row of a matrix: values, presence flags, full flag.
#[derive(Clone, Copy)]
pub struct RowRef<'a> {
    pub v: &'a [f32],
    pub p: &'a [u8],
    pub full: bool,
}

impl Selection {
    /// `ranges` = `None` selects the whole grid; otherwise only points inside one of the (inclusive) ranges.
    pub fn new(q: &[f64], ranges: Option<&[(f64, f64)]>) -> Self {
        let inside = |i: usize| {
            ranges.is_none_or(|r| {
                let x = grid_x(i);
                r.iter().any(|(a, b)| (*a..=*b).contains(&x))
            })
        };
        let mask: Vec<bool> = (0..GRID_N)
            .map(|i| !masked(i) && q[i].is_finite() && inside(i))
            .collect();
        let count = mask.iter().filter(|m| **m).count();
        let full = (0..GRID_N).all(|i| mask[i] == !masked(i));
        let w: Vec<f64> = mask.iter().map(|m| if *m { 1.0 } else { 0.0 }).collect();
        let mean =
            (0..GRID_N).filter(|i| mask[*i]).map(|i| q[i]).sum::<f64>() / count.max(1) as f64;
        let mut qc: Vec<f64> = (0..GRID_N)
            .map(|i| if mask[i] { q[i] - mean } else { 0.0 })
            .collect();
        let norm = qc.iter().map(|x| x * x).sum::<f64>().sqrt();
        let flat = count < 3 || norm <= 1e-300;
        if !flat {
            qc.iter_mut().for_each(|x| *x /= norm);
        }
        let q = (0..GRID_N)
            .map(|i| if mask[i] { q[i] } else { 0.0 })
            .collect();
        Self {
            mask,
            count,
            full,
            q,
            qc,
            w,
            flat,
        }
    }
}

fn dot_f64_f32(a: &[f64], b: &[f32]) -> f64 {
    let mut acc = [0.0f64; 4];
    let (ca, cb) = (a.chunks_exact(4), b.chunks_exact(4));
    let tail: f64 = ca
        .remainder()
        .iter()
        .zip(cb.remainder())
        .map(|(x, y)| x * f64::from(*y))
        .sum();
    for (x, y) in ca.zip(cb) {
        for k in 0..4 {
            acc[k] += x[k] * f64::from(y[k]);
        }
    }
    acc.iter().sum::<f64>() + tail
}

/// Dot product of two f32 rows accumulated in f64.
pub fn dot_f32(a: &[f32], b: &[f32]) -> f64 {
    let mut acc = [0.0f64; 4];
    let (ca, cb) = (a.chunks_exact(4), b.chunks_exact(4));
    let tail: f64 = ca
        .remainder()
        .iter()
        .zip(cb.remainder())
        .map(|(x, y)| f64::from(*x) * f64::from(*y))
        .sum();
    for (x, y) in ca.zip(cb) {
        for k in 0..4 {
            acc[k] += f64::from(x[k]) * f64::from(y[k]);
        }
    }
    acc.iter().sum::<f64>() + tail
}

fn finish(num: f64, var: f64) -> f64 {
    if var > 1e-300 {
        (num / var.sqrt()).clamp(-1.0, 1.0)
    } else {
        0.0
    }
}

/// Pearson r of the query selection against `row`, and the coverage (share of the selected points the row has).
pub fn score(sel: &Selection, row: RowRef) -> (f64, f64) {
    if sel.flat || sel.count == 0 {
        return (0.0, 0.0);
    }
    if sel.full && row.full {
        return (dot_f64_f32(&sel.qc, row.v).clamp(-1.0, 1.0), 1.0);
    }
    if row.full {
        let (mut s1, mut s2, mut d) = (0.0, 0.0, 0.0);
        for i in 0..GRID_N {
            let v = f64::from(row.v[i]);
            s1 += sel.w[i] * v;
            s2 += sel.w[i] * v * v;
            d += sel.qc[i] * v;
        }
        return (finish(d, s2 - s1 * s1 / sel.count as f64), 1.0);
    }
    partial(sel, row)
}

/// Rows with absent points: raw sums over the points both have.
fn partial(sel: &Selection, row: RowRef) -> (f64, f64) {
    let (mut n, mut sq, mut sv, mut sqq, mut svv, mut sqv) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for i in 0..GRID_N {
        if sel.mask[i] && row.p[i] == 1 {
            let (q, v) = (sel.q[i], f64::from(row.v[i]));
            n += 1.0;
            sq += q;
            sv += v;
            sqq += q * q;
            svv += v * v;
            sqv += q * v;
        }
    }
    let cov = n / sel.count as f64;
    if n < 3.0 {
        return (0.0, cov);
    }
    (
        finish(n * sqv - sq * sv, (n * sqq - sq * sq) * (n * svv - sv * sv)).clamp(-1.0, 1.0),
        cov,
    )
}

/// Pearson r of two rows (twins): a dot product when both are full, else over the points both have.
pub fn pair(a: RowRef, b: RowRef) -> f64 {
    if a.full && b.full {
        return dot_f32(a.v, b.v).clamp(-1.0, 1.0);
    }
    let (mut n, mut sa, mut sb, mut saa, mut sbb, mut sab) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for i in 0..GRID_N {
        if a.p[i] == 1 && b.p[i] == 1 {
            let (x, y) = (f64::from(a.v[i]), f64::from(b.v[i]));
            n += 1.0;
            sa += x;
            sb += y;
            saa += x * x;
            sbb += y * y;
            sab += x * y;
        }
    }
    if n < 3.0 {
        return 0.0;
    }
    finish(n * sab - sa * sb, (n * saa - sa * sa) * (n * sbb - sb * sb))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::confronti::libreria::Matrix;

    fn wave(phase: f64, scale: f64) -> Vec<f64> {
        (0..GRID_N)
            .map(|i| {
                if masked(i) {
                    f64::NAN
                } else {
                    scale * (i as f64 * 0.07 + phase).sin() + 5.0
                }
            })
            .collect()
    }

    fn row(m: &Matrix, i: usize) -> RowRef<'_> {
        RowRef {
            v: m.row(i),
            p: m.presence(i),
            full: m.full[i],
        }
    }

    #[test]
    fn full_rows_give_one_for_the_same_shape_and_less_for_another() {
        let mut m = Matrix::default();
        m.push(&wave(0.0, 1.0));
        m.push(&wave(1.0, 1.0));
        let sel = Selection::new(&wave(0.0, 40.0), None);
        assert!(sel.full && sel.count == GRID_N - 251);
        let (same, cov) = score(&sel, row(&m, 0));
        assert!((same - 1.0).abs() < 1e-6 && cov == 1.0, "{same}");
        assert!(score(&sel, row(&m, 1)).0 < 0.9);
        assert!((pair(row(&m, 0), row(&m, 0)) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn a_range_recomputes_mean_and_norm_on_the_selected_points() {
        let mut m = Matrix::default();
        m.push(&wave(0.3, 1.0));
        let q = wave(0.3, 2.0);
        let sel = Selection::new(&q, Some(&[(800.0, 1500.0)]));
        assert!(!sel.full && sel.count == 351);
        let (r, _) = score(&sel, row(&m, 0));
        assert!((r - 1.0).abs() < 1e-6, "{r}");
    }

    #[test]
    fn rows_with_absent_points_report_their_coverage() {
        let mut v = wave(0.2, 1.0);
        v.iter_mut().take(300).for_each(|x| *x = f64::NAN);
        let mut m = Matrix::default();
        m.push(&v);
        assert!(!m.full[0]);
        let sel = Selection::new(&wave(0.2, 1.0), None);
        let (r, cov) = score(&sel, row(&m, 0));
        assert!((r - 1.0).abs() < 1e-6, "{r}");
        assert!(cov < 0.8 && cov > 0.7, "{cov}");
    }
}
