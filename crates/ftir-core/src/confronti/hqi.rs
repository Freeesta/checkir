//! `hqi_euclideo/1`: Euclidean hit quality index on the first derivatives, 100 × (1 − ‖a − b‖² / 4) with `a` and `b`
//! centred and scaled to norm 1 on the points both have. It exists only to speak the language of commercial software
//! (LabSolutions, KnowItAll): on such vectors it equals 100 × (1 + r) / 2, so it carries nothing beyond the Pearson r.
use super::prepare;
use crate::error::{EngineError, EngineResult};
use crate::spectrum::Spectrum;

/// The HQI that goes with a Pearson r over the same points.
pub fn from_r(r: f64) -> f64 {
    100.0 * (1.0 + r) / 2.0
}

/// Centred, unit-norm copies of `a` and `b` on the points where both are finite.
fn unit_pair(a: &[f64], b: &[f64]) -> Option<(Vec<f64>, Vec<f64>)> {
    let idx: Vec<usize> = (0..a.len().min(b.len()))
        .filter(|i| a[*i].is_finite() && b[*i].is_finite())
        .collect();
    if idx.len() < 3 {
        return None;
    }
    let unit = |v: &[f64]| {
        let m = idx.iter().map(|i| v[*i]).sum::<f64>() / idx.len() as f64;
        let c: Vec<f64> = idx.iter().map(|i| v[*i] - m).collect();
        let n = c.iter().map(|x| x * x).sum::<f64>().sqrt();
        (n > 1e-300).then(|| c.into_iter().map(|x| x / n).collect::<Vec<f64>>())
    };
    Some((unit(a)?, unit(b)?))
}

/// `hqi_euclideo/1`, from the formula (not through r), 0–100; 100 with itself.
pub fn score(a: &Spectrum, b: &Spectrum) -> EngineResult<f64> {
    let (pa, pb) = (prepare(a)?, prepare(b)?);
    let (ua, ub) = unit_pair(&pa.deriv, &pb.deriv).ok_or_else(|| {
        EngineError::new(
            "confronti.nessun_punto_comune",
            "the spectra share too few usable points",
        )
    })?;
    let d2: f64 = ua.iter().zip(&ub).map(|(x, y)| (x - y) * (x - y)).sum();
    Ok(100.0 * (1.0 - d2 / 4.0))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::confronti::pearson;
    use crate::synthetic::{generate, Params};

    #[test]
    fn it_is_the_pearson_r_in_other_units() {
        let a = generate(&Params::demo());
        let mut p = Params::demo();
        p.seed += 1;
        let b = generate(&p);
        let r = pearson::score_derivative(&a, &b).unwrap();
        assert!((score(&a, &b).unwrap() - from_r(r)).abs() < 1e-9);
        assert!((score(&a, &a).unwrap() - 100.0).abs() < 1e-9);
    }
}
