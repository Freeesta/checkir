//! Library comparison (package CONFRONTO): the sample, or a residual, against every active library at once.
//!
//! The program proposes, the chemist decides: the proposed level is never "confirmed" and no result carries words of
//! certainty. Rows of a library are prepared once (`libreria`), searched together (`indice`, `cerca`) and the result
//! (`risultato`) records the chain, the libraries (id, version, size), the thresholds version, the ranges and the alerts.
//!
//! Vectors: every spectrum becomes two vectors on the grid 650–3800 cm⁻¹ step 2 (1576 points, `NaN` = absent):
//! the first derivative of the chain `confronto_v1` and the spectrum after AsLS (chain `confronto_spettro_v1`).
use crate::error::{EngineError, EngineResult};
use crate::passi::catene::{self, CONFRONTO_V1};
use crate::passi::maschera;
use crate::spectrum::Spectrum;

pub mod asls;
pub mod cache_bytes;
pub mod cerca;
pub mod controlli;
pub mod hqi;
pub mod indice;
pub mod lettori;
pub mod libreria;
pub mod livello;
pub mod motore;
pub mod opzioni;
pub mod pearson;
pub mod prova;
pub mod prova_rapporto;
pub mod punteggio;
pub mod risultato;
pub mod soglie;

pub const GRID_FROM_CM1: f64 = 650.0;
pub const GRID_STEP_CM1: f64 = 2.0;
pub const GRID_N: usize = 1576;
/// Zone always excluded (diamond), as in the `maschera/1` step of the chains.
pub const MASK_CM1: (f64, f64) = (1900.0, 2400.0);
/// Version of the prepared vectors: a change of chain or baseline raises it and the caches are rebuilt, never migrated.
pub const CACHE_VERSION: u32 = 2;

/// Chain of the spectrum score: absorbance → grid (the baseline and the mask follow in `prepare`).
pub const CONFRONTO_SPETTRO_V1: &str = r#"{"schema":"catene/1","id":"confronto_spettro_v1","steps":[
{"id":"trasmittanza_in_assorbanza/1","params":{"percent":true}},
{"id":"griglia/1","params":{"from_cm1":650,"to_cm1":3800,"step_cm1":2}}]}"#;

/// Wavenumber of grid point `i`.
pub fn grid_x(i: usize) -> f64 {
    GRID_FROM_CM1 + GRID_STEP_CM1 * i as f64
}

/// True when grid point `i` lies in the always-excluded zone.
pub fn masked(i: usize) -> bool {
    (MASK_CM1.0..=MASK_CM1.1).contains(&grid_x(i))
}

/// The two vectors of one spectrum, length `GRID_N`, `NaN` where absent or masked.
#[derive(Debug, Clone)]
pub struct Prepared {
    pub deriv: Vec<f64>,
    pub spec: Vec<f64>,
}

fn unusable(why: &str) -> EngineError {
    EngineError::new("confronti.spettro_non_utilizzabile", why)
}

/// The query as absorbance on the comparison grid, before the baseline and the mask (what the quality alerts look at).
pub fn grid_absorbance(s: &Spectrum) -> Option<Spectrum> {
    catene::run(s, CONFRONTO_SPETTRO_V1).ok()
}

/// Run both chains (and the AsLS baseline) on `s`.
pub fn prepare(s: &Spectrum) -> EngineResult<Prepared> {
    let d = catene::run(s, CONFRONTO_V1)?;
    let mut g = catene::run(s, CONFRONTO_SPETTRO_V1)?;
    let base = asls::baseline(&g.y, &asls::DEFAULT)
        .ok_or_else(|| unusable("fewer than 5 points on the grid"))?;
    for (v, b) in g.y.iter_mut().zip(&base) {
        *v -= b;
    }
    let sp = maschera::apply(&g, r#"{"intervals_cm1":[[1900,2400]]}"#)?;
    if d.y.len() != GRID_N || sp.y.len() != GRID_N {
        return Err(unusable("the chain did not produce the comparison grid"));
    }
    if d.y.iter().filter(|v| v.is_finite()).count() < 5 {
        return Err(unusable("no usable derivative points"));
    }
    Ok(Prepared {
        deriv: d.y,
        spec: sp.y,
    })
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::passi::json::{parse, Value};

    #[test]
    fn mask_and_grid_agree_with_the_chain() {
        let chain = parse(CONFRONTO_V1).expect("chain");
        let steps = chain.get("steps").and_then(Value::as_arr).expect("steps");
        let mask = steps.last().and_then(|s| s.get("params")).expect("params");
        let iv = mask
            .get("intervals_cm1")
            .and_then(Value::as_arr)
            .expect("iv");
        let pair = iv[0].as_arr().expect("pair");
        assert_eq!(
            (pair[0].as_f64(), pair[1].as_f64()),
            (Some(MASK_CM1.0), Some(MASK_CM1.1))
        );
        assert_eq!(grid_x(GRID_N - 1), 3800.0);
        assert!(masked(625) && masked(875) && !masked(624) && !masked(876));
    }
}
