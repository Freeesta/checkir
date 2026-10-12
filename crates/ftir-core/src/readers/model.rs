//! Data model of the reader contract `ftir-reader/1`: `Document`, `Spectrum`, `Field`, `Warning`.
//!
//! Readers never convert: x keeps the direction of the file, units are the declared ones.

/// How sure a reader is that it can open a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Confidence {
    No,
    Likely,
    Certain,
}

/// What the file says a spectrum is. `Unknown` when the file does not say.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Sample,
    Reference,
    Background,
    SampleInterferogram,
    BackgroundInterferogram,
    Subtraction,
    Residual,
    Processed,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum XUnit {
    Cm1,
    Um,
    Nm,
    /// Optical path difference of an interferogram, in cm.
    Cm,
    Points,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Order {
    Ascending,
    Descending,
    /// Explicit x values that are not monotonic (scattered points).
    Unordered,
}

#[derive(Debug, Clone, PartialEq)]
pub enum XValues {
    /// Evenly spaced axis, `n` points from `first` to `last` included.
    Regular {
        first: f64,
        last: f64,
        n: usize,
    },
    Explicit(Vec<f64>),
}

impl XValues {
    pub fn len(&self) -> usize {
        match self {
            XValues::Regular { n, .. } => *n,
            XValues::Explicit(v) => v.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The axis as a vector (regular axes are expanded).
    pub fn to_vec(&self) -> Vec<f64> {
        match self {
            XValues::Explicit(v) => v.clone(),
            XValues::Regular { first, last, n } => {
                let step = if *n > 1 {
                    (last - first) / (*n - 1) as f64
                } else {
                    0.0
                };
                (0..*n)
                    .map(|i| {
                        if i + 1 == *n && *n > 1 {
                            *last
                        } else {
                            first + step * i as f64
                        }
                    })
                    .collect()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct XAxis {
    pub unit: XUnit,
    pub order: Order,
    pub values: XValues,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum YUnit {
    Absorbance,
    TransmittancePercent,
    TransmittanceFraction,
    Reflectance,
    KubelkaMunk,
    LogInvR,
    SingleBeam,
    Interferogram,
    Arbitrary,
    Unknown,
}

#[derive(Debug, Clone, PartialEq)]
pub struct YAxis {
    pub unit: YUnit,
    pub values: Vec<f64>,
    /// Quantisation step of the file (JCAMP `YFACTOR`), used for tolerances.
    pub quantum: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    Text,
    Integer,
    Real,
    Date,
    Bytes,
}

/// Anything the file says, kept so that nothing is lost.
#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    /// Where it sits in the file, e.g. `line 12 ##ORIGIN`.
    pub origin: String,
    /// Normalised key (JCAMP: upper case, no space, `-`, `/`, `_`).
    pub key: String,
    /// Key as written in the file.
    pub original_key: String,
    /// Original text of the value.
    pub value: String,
    pub kind: FieldKind,
    pub unit: Option<String>,
    /// Name of the standard field the value also ended up in.
    pub mapped: Option<&'static str>,
    /// Identifies a person, a machine or a sample: removed by the anonymous export.
    pub identity: bool,
    /// Listed in the reader's list of known keys.
    pub known: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Info,
    Caution,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Warning {
    pub key: &'static str,
    pub params: Vec<(&'static str, String)>,
    pub severity: Severity,
}

impl Warning {
    pub fn new(key: &'static str, severity: Severity) -> Self {
        Self {
            key,
            params: Vec::new(),
            severity,
        }
    }

    pub fn with(mut self, name: &'static str, value: impl ToString) -> Self {
        self.params.push((name, value.to_string()));
        self
    }
}

/// A standard value together with the index (in `Spectrum::fields`) of the field it comes from.
#[derive(Debug, Clone, PartialEq)]
pub struct Sourced<T> {
    pub value: T,
    pub field: usize,
}

/// Instrument data; every entry is optional: absent is better than wrong.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Instrument {
    pub model: Option<Sourced<String>>,
    pub resolution_cm1: Option<Sourced<f64>>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Measurement {
    pub title: Option<Sourced<String>>,
    pub sample_name: Option<Sourced<String>>,
    /// ISO 8601, only when the file states it unambiguously.
    pub datetime: Option<Sourced<String>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Spectrum {
    pub role: Role,
    pub x: XAxis,
    pub y: YAxis,
    pub instrument: Instrument,
    pub measurement: Measurement,
    /// Processing steps declared by the file (original text).
    pub history: Vec<String>,
    pub fields: Vec<Field>,
    pub warnings: Vec<Warning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provenance {
    pub reader: &'static str,
    pub reader_version: &'static str,
    pub format: String,
    pub variant: String,
    pub sha256: String,
    pub size: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub spectra: Vec<Spectrum>,
    /// Index of the spectrum to show first: the first data block.
    pub primary: usize,
    pub fields: Vec<Field>,
    pub warnings: Vec<Warning>,
    pub provenance: Provenance,
}

/// Limits every `open` must respect (contract §1.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub max_bytes: usize,
    pub max_spectra: usize,
    pub max_points: usize,
    pub max_fields: usize,
    pub max_header_lines: usize,
    pub max_value_len: usize,
    pub max_chain: usize,
}

impl Limits {
    pub const STANDARD: Limits = Limits {
        max_bytes: 64 * 1024 * 1024,
        max_spectra: 256,
        max_points: 2_000_000,
        max_fields: 20_000,
        max_header_lines: 10_000,
        max_value_len: 64 * 1024,
        max_chain: 100_000,
    };
}

/// Choices of the user passed on re-opening. JCAMP-DX defines none; the text reader takes a forced separator and decimal.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Options {
    /// Column separator: `'\t'`, `';'`, `','` or `' '` (any run of white space).
    pub separator: Option<char>,
    /// Decimal mark: `'.'` or `','`.
    pub decimal: Option<char>,
}

/// A translatable read error: `key` is looked up in the catalogs, `params` fill its placeholders.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadError {
    pub key: &'static str,
    pub params: Vec<(&'static str, String)>,
}

impl ReadError {
    pub fn new(key: &'static str) -> Self {
        Self {
            key,
            params: Vec::new(),
        }
    }

    pub fn with(mut self, name: &'static str, value: impl ToString) -> Self {
        self.params.push((name, value.to_string()));
        self
    }

    pub fn limit(name: &'static str, max: usize) -> Self {
        Self::new("reader.limit_exceeded")
            .with("limit", name)
            .with("max", max)
    }
}

impl From<ReadError> for crate::error::EngineError {
    fn from(e: ReadError) -> Self {
        let mut out = crate::error::EngineError::new(e.key, e.key);
        out.params = e.params;
        out
    }
}

pub type ReadResult<T> = Result<T, ReadError>;
