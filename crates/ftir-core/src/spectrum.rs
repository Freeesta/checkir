//! The single spectrum type. Sample, reference, residual, subtraction and mean are the same object with a `Role`.

/// What a spectrum is used for. Only presentation and provenance differ; the data model is one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Sample,
    Reference,
    Residual,
    Subtraction,
    Mean,
}

/// Unit of the y axis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum YUnit {
    Absorbance,
    Transmittance,
}

/// A spectrum on an explicit wavenumber axis (cm⁻¹).
#[derive(Debug, Clone, PartialEq)]
pub struct Spectrum {
    pub role: Role,
    pub y_unit: YUnit,
    pub wavenumber_cm1: Vec<f64>,
    pub y: Vec<f64>,
    /// Steps applied so far, oldest first, as `id/version {params}`. Empty for a spectrum straight from a reader.
    pub history: Vec<String>,
}

impl Spectrum {
    pub fn new(role: Role, y_unit: YUnit, wavenumber_cm1: Vec<f64>, y: Vec<f64>) -> Self {
        debug_assert_eq!(wavenumber_cm1.len(), y.len());
        Self {
            role,
            y_unit,
            wavenumber_cm1,
            y,
            history: Vec::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.y.len()
    }

    pub fn is_empty(&self) -> bool {
        self.y.is_empty()
    }
}
