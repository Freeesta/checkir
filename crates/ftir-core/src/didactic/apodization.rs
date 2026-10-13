//! Apodization windows of the interferogram; `u` = |OPD| / OPD_max in [0, 1].

use crate::error::{EngineError, EngineResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Apodization {
    Boxcar,
    Triangular,
    HappGenzel,
    BlackmanHarris3,
}

impl Apodization {
    pub const ALL: [Apodization; 4] = [
        Apodization::Boxcar,
        Apodization::Triangular,
        Apodization::HappGenzel,
        Apodization::BlackmanHarris3,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Apodization::Boxcar => "boxcar",
            Apodization::Triangular => "triangular",
            Apodization::HappGenzel => "happ_genzel",
            Apodization::BlackmanHarris3 => "blackman_harris_3",
        }
    }

    pub fn from_id(id: &str) -> EngineResult<Self> {
        Self::ALL.into_iter().find(|a| a.id() == id).ok_or_else(|| {
            EngineError::new("didactic.unknown_apodization", "unknown apodization")
                .with_param("id", id)
        })
    }

    pub fn weight(self, u: f64) -> f64 {
        let pi_u = std::f64::consts::PI * u;
        match self {
            Apodization::Boxcar => 1.0,
            Apodization::Triangular => 1.0 - u,
            Apodization::HappGenzel => 0.54 + 0.46 * pi_u.cos(),
            Apodization::BlackmanHarris3 => {
                0.42323 + 0.49755 * pi_u.cos() + 0.07922 * (2.0 * pi_u).cos()
            }
        }
    }
}
