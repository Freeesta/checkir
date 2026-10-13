//! Comparison scores registry (`COMPARISONS`): spectrum against reference. The implementations live in `crate::confronti`.
use crate::confronti::pearson;
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// Version of the comparison contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One comparison: a pure score in [-1, 1] (a correlation) between two spectra, each prepared by its own chain.
pub struct Comparison {
    pub id: &'static str,
    pub version: u32,
    pub contract: u32,
    pub score: fn(&Spectrum, &Spectrum) -> EngineResult<f64>,
}

pub static COMPARISONS: &[Comparison] = &[
    Comparison {
        id: "pearson_derivata",
        version: 1,
        contract: CONTRACT,
        score: pearson::score_derivative,
    },
    Comparison {
        id: "pearson_spettro",
        version: 1,
        contract: CONTRACT,
        score: pearson::score_spectrum,
    },
    Comparison {
        id: "pearson_regioni",
        version: 1,
        contract: CONTRACT,
        score: pearson::score_regions,
    },
];

#[cfg(test)]
mod test {
    use super::*;
    use crate::synthetic::{generate, Params};

    #[test]
    fn conformance() {
        let s = generate(&Params::demo());
        let mut ids = std::collections::HashSet::new();
        for c in COMPARISONS {
            assert_eq!(c.contract, CONTRACT, "{}", c.id);
            assert!(ids.insert(c.id), "duplicate id {}", c.id);
            let one = (c.score)(&s, &s).unwrap_or_else(|e| panic!("{}: {}", c.id, e.error));
            assert!((one - 1.0).abs() < 1e-9, "{}: self score {}", c.id, one);
        }
    }
}
