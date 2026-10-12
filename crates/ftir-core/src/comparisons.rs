//! Comparison scores registry (`COMPARISONS`): spectrum against reference. Empty until the match package.
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// Version of the comparison contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One comparison: a pure score in [0, 1] between a sample and a reference on the same axis.
pub struct Comparison {
    pub id: &'static str,
    pub version: u32,
    pub contract: u32,
    pub score: fn(&Spectrum, &Spectrum) -> EngineResult<f64>,
}

pub static COMPARISONS: &[Comparison] = &[];

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
            assert!((0.0..=1.0).contains(&one), "{}: {}", c.id, one);
        }
    }
}
