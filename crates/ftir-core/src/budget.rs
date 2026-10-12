//! Memory budget contract: every `apri` receives the limits it must respect.
use crate::errore::{Errore, Esito};

/// Limits passed to every reader and step. The page chooses them; the engine never exceeds them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    /// Maximum input size in bytes.
    pub max_byte: usize,
    /// Maximum number of points of one spectrum.
    pub max_punti: usize,
}

impl Budget {
    pub const STANDARD: Budget = Budget {
        max_byte: 32 * 1024 * 1024,
        max_punti: 1 << 20,
    };

    pub fn controlla_byte(&self, n: usize) -> Esito<()> {
        if n > self.max_byte {
            return Err(Errore::new("errore.budget.byte", "input too large")
                .con("max", self.max_byte)
                .con("size", n));
        }
        Ok(())
    }

    pub fn controlla_punti(&self, n: usize) -> Esito<()> {
        if n > self.max_punti {
            return Err(Errore::new("errore.budget.punti", "too many points")
                .con("max", self.max_punti)
                .con("points", n));
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn limits_are_enforced() {
        let b = Budget {
            max_byte: 10,
            max_punti: 5,
        };
        assert!(b.controlla_byte(10).is_ok());
        assert_eq!(
            b.controlla_byte(11).unwrap_err().error_key,
            "errore.budget.byte"
        );
        assert_eq!(
            b.controlla_punti(6).unwrap_err().error_key,
            "errore.budget.punti"
        );
    }
}
