//! Single-channel spectra and absorbance recomputed by checkIR from the two interferograms of an instrument file
//! (sample and background). Used for quality and teaching only, never for comparison: the comparison reads the
//! absorbance the instrument software saved. Everything made here is marked `computed_by: checkir` in its history.
//!
//! The recipe is the one validated against the saved absorbance of the real files: remove the mean, find the
//! centre burst (largest |y|), weight with a triangle that is 1 at the centre and 0 at the farther end, move the
//! centre to index 0, take the magnitude of the real FFT (no phase correction). The instrument's own apodization
//! and phase correction are not public, so the result is close to, not equal to, the saved absorbance.
use crate::didactic::fft::fft;
use crate::error::{EngineError, EngineResult};
use crate::readers::model::{
    computed_entry, Document, Instrument, Measurement, Order, Role, Spectrum, XAxis, XUnit,
    XValues, YAxis, YUnit,
};

pub mod energy;

/// Step ids written in the history (`computed_by: checkir · <id>`).
pub const STEP_SINGLE_BEAM: &str = "single_beam";
pub const STEP_ABSORBANCE: &str = "absorbance_from_interferograms";

/// Magnitude spectrum of one interferogram.
#[derive(Debug, Clone, PartialEq)]
pub struct Channel {
    pub wavenumber_cm1: Vec<f64>,
    pub magnitude: Vec<f64>,
    /// Index of the centre burst in the interferogram.
    pub centre: usize,
    /// Sampling step of the optical path difference, in cm.
    pub step_cm: f64,
}

fn bad(key: &'static str, msg: &'static str, n: usize) -> EngineError {
    EngineError::new(key, msg).with_param("length", n)
}

/// Single channel of an interferogram sampled every `step_cm` (> 0): `y.len()` must be a power of two, at least 8.
pub fn channel(y: &[f64], step_cm: f64) -> EngineResult<Channel> {
    let n = y.len();
    if n < 8 || !n.is_power_of_two() {
        return Err(bad(
            "single_beam.length",
            "the interferogram length must be a power of two",
            n,
        ));
    }
    if !(step_cm.is_finite() && step_cm > 0.0) || y.iter().any(|v| !v.is_finite()) {
        return Err(bad(
            "single_beam.invalid",
            "the interferogram has no valid step or values",
            n,
        ));
    }
    let mean = y.iter().sum::<f64>() / n as f64;
    let centred: Vec<f64> = y.iter().map(|v| v - mean).collect();
    let centre = centred
        .iter()
        .enumerate()
        .fold((0, f64::MIN), |best, (i, v)| {
            if v.abs() > best.1 {
                (i, v.abs())
            } else {
                best
            }
        })
        .0;
    let span = centre.max(n - centre) as f64;
    // Rolled so that the centre burst sits at index 0, as numpy.roll(…, -centre).
    let mut re: Vec<f64> = (0..n)
        .map(|j| {
            let i = (j + centre) % n;
            centred[i] * (1.0 - (i as f64 - centre as f64).abs() / span)
        })
        .collect();
    let mut im = vec![0.0; n];
    fft(&mut re, &mut im)?;
    let bins = n / 2 + 1;
    let magnitude = (0..bins).map(|k| re[k].hypot(im[k])).collect();
    let df = 1.0 / (n as f64 * step_cm);
    Ok(Channel {
        wavenumber_cm1: (0..bins).map(|k| k as f64 * df).collect(),
        magnitude,
        centre,
        step_cm,
    })
}

/// `numpy.interp`: linear, values outside `xp` (ascending) take the edge value.
pub fn interp(x: f64, xp: &[f64], fp: &[f64]) -> f64 {
    let (Some(&first), Some(&last)) = (xp.first(), xp.last()) else {
        return f64::NAN;
    };
    if x <= first {
        return fp[0];
    }
    if x >= last {
        return fp[fp.len() - 1];
    }
    let hi = xp.partition_point(|v| *v <= x);
    let lo = hi - 1;
    let t = (x - xp[lo]) / (xp[hi] - xp[lo]);
    fp[lo] + t * (fp[hi] - fp[lo])
}

/// A = −log10(S/B) on the given wavenumbers; a point where S or B is not positive is absent (NaN).
pub fn absorbance(sample: &Channel, background: &Channel, wavenumber_cm1: &[f64]) -> Vec<f64> {
    wavenumber_cm1
        .iter()
        .map(|x| {
            let s = interp(*x, &sample.wavenumber_cm1, &sample.magnitude);
            let b = interp(*x, &background.wavenumber_cm1, &background.magnitude);
            let a = -(s / b).log10();
            if s > 0.0 && b > 0.0 && a.is_finite() {
                a
            } else {
                f64::NAN
            }
        })
        .collect()
}

/// Step between two points of an interferogram's optical path difference axis, in cm (always positive).
pub(crate) fn step_of(s: &Spectrum) -> Option<f64> {
    let n = s.y.values.len();
    let (first, last) = match &s.x.values {
        XValues::Regular { first, last, .. } => (*first, *last),
        XValues::Explicit(v) => (*v.first()?, *v.last()?),
    };
    (n > 1 && s.x.unit == XUnit::Cm).then(|| ((last - first) / (n - 1) as f64).abs())
}

/// The two single channels and the absorbance recomputed from the interferograms of a file.
#[derive(Debug, Clone, PartialEq)]
pub struct Recomputed {
    pub sample: Spectrum,
    pub background: Spectrum,
    pub absorbance: Spectrum,
}

fn single_beam_spectrum(role: Role, c: &Channel) -> Spectrum {
    Spectrum {
        role,
        x: XAxis {
            unit: XUnit::Cm1,
            order: Order::Ascending,
            values: XValues::Explicit(c.wavenumber_cm1.clone()),
        },
        y: YAxis {
            unit: YUnit::SingleBeam,
            values: c.magnitude.clone(),
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: vec![computed_entry(STEP_SINGLE_BEAM)],
        fields: Vec::new(),
        warnings: Vec::new(),
    }
}

/// The interferograms of a document: the sample's and the one `Document::background` points to.
pub(crate) fn interferograms(doc: &Document) -> EngineResult<(&Spectrum, &Spectrum)> {
    let missing = || {
        EngineError::new(
            "single_beam.missing",
            "the file has no pair of interferograms",
        )
    };
    let bg = doc
        .background
        .spectrum_index
        .and_then(|i| doc.spectra.get(i))
        .filter(|s| s.y.unit == YUnit::Interferogram)
        .ok_or_else(missing)?;
    let sample = doc
        .spectra
        .iter()
        .find(|s| s.role == Role::SampleInterferogram)
        .ok_or_else(missing)?;
    Ok((sample, bg))
}

/// Recomputes both single channels and the absorbance on the axis of the document's main spectrum (cm⁻¹).
/// Errors never block anything: the caller shows them as «not evaluable».
pub fn recompute(doc: &Document) -> EngineResult<Recomputed> {
    let (ig, bg) = interferograms(doc)?;
    let step = |s: &Spectrum| {
        step_of(s).ok_or_else(|| EngineError::new("single_beam.invalid", "no valid step"))
    };
    let (cs, cb) = (
        channel(&ig.y.values, step(ig)?)?,
        channel(&bg.y.values, step(bg)?)?,
    );
    let main = doc
        .spectra
        .get(doc.primary)
        .filter(|s| s.x.unit == XUnit::Cm1)
        .ok_or_else(|| {
            EngineError::new(
                "single_beam.no_axis",
                "the main spectrum has no wavenumber axis",
            )
        })?;
    let x = main.x.values.to_vec();
    let mut abs = single_beam_spectrum(Role::Processed, &cs);
    abs.x = main.x.clone();
    abs.y = YAxis {
        unit: YUnit::Absorbance,
        values: absorbance(&cs, &cb, &x),
        quantum: None,
    };
    abs.history = vec![computed_entry(STEP_ABSORBANCE)];
    Ok(Recomputed {
        sample: single_beam_spectrum(Role::Sample, &cs),
        background: single_beam_spectrum(Role::Background, &cb),
        absorbance: abs,
    })
}

/// Pearson correlation of two series over the points where both are finite and the wavenumber is in `[lo, hi]`.
pub fn correlation(x: &[f64], a: &[f64], b: &[f64], lo: f64, hi: f64) -> Option<f64> {
    let pts: Vec<(f64, f64)> = (0..x.len().min(a.len()).min(b.len()))
        .filter(|&i| x[i] > lo && x[i] < hi && a[i].is_finite() && b[i].is_finite())
        .map(|i| (a[i], b[i]))
        .collect();
    if pts.len() < 3 {
        return None;
    }
    let n = pts.len() as f64;
    let (ma, mb) = (
        pts.iter().map(|p| p.0).sum::<f64>() / n,
        pts.iter().map(|p| p.1).sum::<f64>() / n,
    );
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for (u, v) in pts {
        sab += (u - ma) * (v - mb);
        saa += (u - ma).powi(2);
        sbb += (v - mb).powi(2);
    }
    (saa > 0.0 && sbb > 0.0).then(|| sab / (saa * sbb).sqrt())
}
