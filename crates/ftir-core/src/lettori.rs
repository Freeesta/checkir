//! Readers registry (`LETTORI`): empty until the format packages add voices.
use crate::budget::Budget;
use crate::errore::Esito;
use crate::spettro::Spettro;

/// Version of the reader contract this registry accepts.
pub const CONTRATTO: u32 = 1;

/// One reader: recognises a byte buffer and opens it within the given budget.
pub struct Lettore {
    pub id: &'static str,
    pub contratto: u32,
    pub riconosci: fn(&[u8]) -> bool,
    pub apri: fn(&[u8], &Budget) -> Esito<Vec<Spettro>>,
}

pub static LETTORI: &[Lettore] = &[];

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn conformance() {
        let mut ids = std::collections::HashSet::new();
        for l in LETTORI {
            assert_eq!(l.contratto, CONTRATTO, "{}", l.id);
            assert!(ids.insert(l.id), "duplicate id {}", l.id);
            let vuoto: &[u8] = &[];
            let _ = (l.riconosci)(vuoto);
            assert!(
                (l.apri)(vuoto, &Budget::STANDARD).is_err() || !(l.riconosci)(vuoto),
                "{}",
                l.id
            );
        }
    }
}
