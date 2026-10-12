//! Processing steps registry (`PASSI`): baseline, normalisation, masks... Empty until the signal package.
use crate::errore::Esito;
use crate::spettro::Spettro;

/// Version of the step contract this registry accepts.
pub const CONTRATTO: u32 = 1;

/// One step: a pure function from spectrum to spectrum, with a versioned id.
pub struct Passo {
    pub id: &'static str,
    pub versione: u32,
    pub contratto: u32,
    pub applica: fn(&Spettro, &str) -> Esito<Spettro>,
}

pub static PASSI: &[Passo] = &[];

#[cfg(test)]
mod test {
    use super::*;
    use crate::sintetico::{genera, Parametri};

    #[test]
    fn conformance() {
        let s = genera(&Parametri::prova());
        let mut ids = std::collections::HashSet::new();
        for p in PASSI {
            assert_eq!(p.contratto, CONTRATTO, "{}", p.id);
            assert!(ids.insert(p.id), "duplicate id {}", p.id);
            let r = (p.applica)(&s, "{}").unwrap_or_else(|e| panic!("{}: {}", p.id, e.error));
            assert_eq!(r.len(), s.len(), "{}", p.id);
        }
    }
}
