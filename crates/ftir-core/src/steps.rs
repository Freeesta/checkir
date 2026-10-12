//! Processing steps registry (`STEPS`): baseline, normalisation, masks... Empty until the signal package.
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// Version of the step contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One step: a pure function from spectrum to spectrum, with a versioned id.
pub struct Step {
    pub id: &'static str,
    pub version: u32,
    pub contract: u32,
    pub apply: fn(&Spectrum, &str) -> EngineResult<Spectrum>,
}

pub static STEPS: &[Step] = &[];

#[cfg(test)]
mod test {
    use super::*;
    use crate::synthetic::{generate, Params};

    #[test]
    fn conformance() {
        let s = generate(&Params::demo());
        let mut ids = std::collections::HashSet::new();
        for p in STEPS {
            assert_eq!(p.contract, CONTRACT, "{}", p.id);
            assert!(ids.insert(p.id), "duplicate id {}", p.id);
            let r = (p.apply)(&s, "{}").unwrap_or_else(|e| panic!("{}: {}", p.id, e.error));
            assert_eq!(r.len(), s.len(), "{}", p.id);
        }
    }
}
