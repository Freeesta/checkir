//! Memory budget contract: every `open` receives the limits it must respect.
use crate::error::{EngineError, EngineResult};

/// Limits passed to every reader and step. The page chooses them; the engine never exceeds them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    /// Maximum input size in bytes.
    pub max_bytes: usize,
    /// Maximum number of points of one spectrum.
    pub max_points: usize,
}

impl Budget {
    pub const STANDARD: Budget = Budget {
        max_bytes: 32 * 1024 * 1024,
        max_points: 1 << 20,
    };

    pub fn check_bytes(&self, n: usize) -> EngineResult<()> {
        if n > self.max_bytes {
            return Err(EngineError::new("error.budget.bytes", "input too large")
                .with_param("max", self.max_bytes)
                .with_param("size", n));
        }
        Ok(())
    }

    pub fn check_points(&self, n: usize) -> EngineResult<()> {
        if n > self.max_points {
            return Err(EngineError::new("error.budget.points", "too many points")
                .with_param("max", self.max_points)
                .with_param("points", n));
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
            max_bytes: 10,
            max_points: 5,
        };
        assert!(b.check_bytes(10).is_ok());
        assert_eq!(
            b.check_bytes(11).unwrap_err().error_key,
            "error.budget.bytes"
        );
        assert_eq!(
            b.check_points(6).unwrap_err().error_key,
            "error.budget.points"
        );
    }
}
