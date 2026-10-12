//! Readers registry (`READERS`): empty until the format packages add voices.
use crate::budget::Budget;
use crate::error::EngineResult;
use crate::spectrum::Spectrum;

/// Version of the reader contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One reader: recognises a byte buffer and opens it within the given budget.
pub struct Reader {
    pub id: &'static str,
    pub contract: u32,
    pub recognize: fn(&[u8]) -> bool,
    pub open: fn(&[u8], &Budget) -> EngineResult<Vec<Spectrum>>,
}

pub static READERS: &[Reader] = &[];

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn conformance() {
        let mut ids = std::collections::HashSet::new();
        for l in READERS {
            assert_eq!(l.contract, CONTRACT, "{}", l.id);
            assert!(ids.insert(l.id), "duplicate id {}", l.id);
            let empty: &[u8] = &[];
            let _ = (l.recognize)(empty);
            assert!(
                (l.open)(empty, &Budget::STANDARD).is_err() || !(l.recognize)(empty),
                "{}",
                l.id
            );
        }
    }
}
