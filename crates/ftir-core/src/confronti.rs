//! Comparison scores registry (`CONFRONTI`): spectrum against reference. Empty until the match package.
use crate::errore::Esito;
use crate::spettro::Spettro;

/// Version of the comparison contract this registry accepts.
pub const CONTRATTO: u32 = 1;

/// One comparison: a pure score in [0, 1] between a sample and a reference on the same axis.
pub struct Confronto {
    pub id: &'static str,
    pub versione: u32,
    pub contratto: u32,
    pub punteggio: fn(&Spettro, &Spettro) -> Esito<f64>,
}

pub static CONFRONTI: &[Confronto] = &[];

#[cfg(test)]
mod test {
    use super::*;
    use crate::sintetico::{genera, Parametri};

    #[test]
    fn conformance() {
        let s = genera(&Parametri::prova());
        let mut ids = std::collections::HashSet::new();
        for c in CONFRONTI {
            assert_eq!(c.contratto, CONTRATTO, "{}", c.id);
            assert!(ids.insert(c.id), "duplicate id {}", c.id);
            let uno = (c.punteggio)(&s, &s).unwrap_or_else(|e| panic!("{}: {}", c.id, e.error));
            assert!((0.0..=1.0).contains(&uno), "{}: {}", c.id, uno);
        }
    }
}
