//! The single spectrum type. Sample, reference, residual, subtraction and mean are the same object with a `Ruolo`.

/// What a spectrum is used for. Only presentation and provenance differ; the data model is one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ruolo {
    Campione,
    Riferimento,
    Residuo,
    Sottrazione,
    Media,
}

/// Unit of the y axis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnitaY {
    Assorbanza,
    Trasmittanza,
}

/// A spectrum on an explicit wavenumber axis (cm⁻¹).
#[derive(Debug, Clone, PartialEq)]
pub struct Spettro {
    pub ruolo: Ruolo,
    pub unita_y: UnitaY,
    pub numero_onda_cm1: Vec<f64>,
    pub y: Vec<f64>,
}

impl Spettro {
    pub fn new(ruolo: Ruolo, unita_y: UnitaY, numero_onda_cm1: Vec<f64>, y: Vec<f64>) -> Self {
        debug_assert_eq!(numero_onda_cm1.len(), y.len());
        Self {
            ruolo,
            unita_y,
            numero_onda_cm1,
            y,
        }
    }

    pub fn len(&self) -> usize {
        self.y.len()
    }

    pub fn is_empty(&self) -> bool {
        self.y.is_empty()
    }
}
