//! Peak detection (package PICCHI), `peak_detect/1`: the maxima of the spectrum with their position, width and
//! prominence, shoulders, broad bands as intervals and the warnings of the measurement. The program proposes, the
//! chemist decides: every position is a proposal with a width, and every limit comes from `peaks_thresholds/1`.
//!
//! Chain `peak_detect_v1`: absorbance → grid 650–3800 cm⁻¹ step 2 → AsLS baseline. The detection then works on that
//! spectrum with the zone 1900–2400 (diamond, CO₂) left out, as the comparison does.
use crate::confronti::{controlli::quality_alerts, grid_absorbance, risultato::Alert, soglie};
use crate::error::{EngineError, EngineResult};
use crate::passi::{catene, json, savitzky_golay, Value};
use crate::spectrum::{Role, Spectrum, YUnit};

pub mod artifacts;
pub mod broad;
pub mod find;
mod noise;
mod refine;
pub mod regions;
pub mod result;
pub mod scan;
mod shoulders;
pub mod thresholds;

use refine::Cand;
use result::{BroadBand, IntensityClass, Kind, Peak, PeakList, Shape, Tier, Warning};
pub use thresholds::Thresholds;

pub const CHAIN_ID: &str = "peak_detect_v1";
pub const CHAIN: &str = r#"{"schema":"catene/1","id":"peak_detect_v1","steps":[
{"id":"trasmittanza_in_assorbanza/1","params":{"percent":true}},
{"id":"griglia/1","params":{"from_cm1":650,"to_cm1":3800,"step_cm1":2}},
{"id":"linea_di_base_asls/1","params":{}}]}"#;

fn unusable(why: &str) -> EngineError {
    EngineError::new("peaks.spettro_non_utilizzabile", why)
}

/// `y` with the points inside the excluded ranges made absent.
fn exclude(y: &[f64], x: &[f64], ranges: &[(f64, f64)]) -> Vec<f64> {
    x.iter()
        .zip(y)
        .map(|(xi, yi)| {
            if ranges.iter().any(|(lo, hi)| (*lo..=*hi).contains(xi)) {
                f64::NAN
            } else {
                *yi
            }
        })
        .collect()
}

fn with_y(s: &Spectrum, y: Vec<f64>) -> Spectrum {
    Spectrum::new(Role::Sample, YUnit::Absorbance, s.wavenumber_cm1.clone(), y)
}

/// Noise sigma of the corrected spectrum: residual from its Savitzky–Golay smoothing in the quiet windows.
fn noise_of(corrected: &Spectrum, t: &Thresholds) -> EngineResult<f64> {
    let n = &t.noise;
    let params = format!(
        r#"{{"window":{},"polyorder":{},"deriv":0}}"#,
        n.smooth_window, n.smooth_polyorder
    );
    let smooth = savitzky_golay::apply(corrected, &params)?;
    let residual: Vec<f64> = corrected
        .y
        .iter()
        .zip(&smooth.y)
        .map(|(a, b)| a - b)
        .collect();
    noise::robust_sigma(&residual, &corrected.wavenumber_cm1, n).ok_or_else(|| {
        EngineError::new(
            "peaks.rumore_non_misurabile",
            "no quiet window of the spectrum has enough points to measure the noise",
        )
    })
}

/// Peak candidates of every run of the masked spectrum.
fn scan_all(masked: &Spectrum, min_prom: f64, local_min: f64, t: &Thresholds) -> Vec<Cand> {
    scan::runs(&masked.y)
        .into_iter()
        .flat_map(|(a, z)| {
            let x = &masked.wavenumber_cm1[a..z];
            scan::scan_run(x, &masked.y[a..z], min_prom, local_min, t)
        })
        .collect()
}

/// Warnings of the measurement that matter to the peaks (the same numbers as the comparison alerts).
fn warnings_of(alerts: &[Alert], peaks: &[Peak], t: &Thresholds) -> Vec<Warning> {
    let mut out: Vec<Warning> = alerts
        .iter()
        .filter_map(|a| {
            let id = match a.id {
                "quality_saturation" => "saturation",
                "quality_weak_signal" => "weak_signal",
                "quality_noise" => "noise",
                "quality_co2_vapour" => "co2_vapour",
                _ => return None,
            };
            Some(Warning {
                id,
                data: a.data.clone(),
            })
        })
        .collect();
    let count = peaks
        .iter()
        .filter(|p| p.kind == Kind::Peak && p.artifact.is_none())
        .count();
    if count > t.too_many_peaks {
        out.push(Warning {
            id: "too_many_peaks",
            data: vec![
                ("count".into(), Value::Num(count as f64)),
                ("limit".into(), Value::Num(t.too_many_peaks as f64)),
            ],
        });
    }
    out
}

fn shape_of(fwhm: f64, t: &Thresholds) -> Shape {
    let [narrow, medium, broad] = t.shape_below_cm1;
    match fwhm {
        w if w < narrow => Shape::Narrow,
        w if w < medium => Shape::Medium,
        w if w < broad => Shape::Broad,
        _ => Shape::VeryBroad,
    }
}

fn round(v: f64, decimals: i32) -> f64 {
    let k = 10f64.powi(decimals);
    (v * k).round() / k
}

/// Candidates in order of position, with ids, classes and regions.
fn finish(mut cands: Vec<Cand>, reference: f64, t: &Thresholds) -> Vec<Peak> {
    cands.sort_by(|a, b| a.position.total_cmp(&b.position));
    cands
        .into_iter()
        .enumerate()
        .map(|(i, c)| {
            let rel = if reference > 0.0 {
                (c.prominence / reference).min(1.0)
            } else {
                0.0
            };
            let position = round(c.position, 1);
            Peak {
                id: format!("p{}", i + 1),
                position_cm1: position,
                height_abs: c.height,
                prominence_abs: c.prominence,
                prominence_rel: rel,
                intensity: IntensityClass::of(
                    rel,
                    t.tolerances.strong_rel_min,
                    t.tolerances.medium_rel_min,
                ),
                fwhm_cm1: c.fwhm.map(|w| round(w, 1)),
                shape: c.fwhm.map(|w| shape_of(w, t)),
                tier: if rel >= t.tiers.main_rel_min {
                    Tier::Main
                } else {
                    Tier::Secondary
                },
                kind: c.kind,
                artifact: c.artifact,
                region_ids: regions::ids_for(position, position),
            }
        })
        .collect()
}

fn bands_of(found: Vec<broad::BroadCand>, reference: f64) -> Vec<BroadBand> {
    let mut found = found;
    found.sort_by(|a, b| a.from.total_cmp(&b.from));
    found
        .into_iter()
        .enumerate()
        .map(|(i, b)| BroadBand {
            id: format!("b{}", i + 1),
            from_cm1: round(b.from, 1),
            to_cm1: round(b.to, 1),
            max_cm1: round(b.max, 1),
            prominence_rel: if reference > 0.0 {
                b.prominence / reference
            } else {
                0.0
            },
            region_ids: regions::ids_for(b.from, b.to),
        })
        .collect()
}

/// Runs the chain on `s` and finds the peaks. `s` may be absorbance or transmittance on any axis.
pub fn detect(s: &Spectrum, t: &Thresholds) -> EngineResult<PeakList> {
    let corrected = catene::run(s, CHAIN)?;
    if corrected.y.iter().filter(|v| v.is_finite()).count() < 100 {
        return Err(unusable("fewer than 100 points on the grid 650-3800 cm-1"));
    }
    let sigma = noise_of(&corrected, t)?;
    let masked = with_y(
        &corrected,
        exclude(
            &corrected.y,
            &corrected.wavenumber_cm1,
            &t.detect.exclude_cm1,
        ),
    );
    let reference = masked
        .y
        .iter()
        .copied()
        .filter(|v| v.is_finite())
        .fold(0.0, f64::max);
    let d = &t.detect;
    let local_min = d.local_noise_ratio * sigma;
    let min_prom = (d.prominence_noise_ratio * sigma).max(d.prominence_rel_min * reference);
    let mut cands = scan_all(&masked, min_prom, local_min, t);
    let positions: Vec<f64> = cands.iter().map(|c| c.position).collect();
    cands.extend(shoulders::find(&masked, &positions, min_prom, t)?);
    let broad_min = (d.prominence_noise_ratio * sigma).max(t.broad.prominence_rel_min * reference);
    let bands = broad::find(&masked, broad_min, t)?;
    let alerts = alerts_of(s, &masked);
    cands.extend(artifacts::co2(&corrected, &alerts, sigma, t));
    artifacts::mark_vapour(&mut cands, &alerts, t);
    let peaks = finish(cands, reference, t);
    Ok(PeakList {
        spectrum_id: None,
        chain_id: CHAIN_ID,
        chain_steps: chain_steps(),
        thresholds_version: t.version,
        noise_abs: sigma,
        reference_abs: reference,
        warnings: warnings_of(&alerts, &peaks, t),
        peaks,
        broad_bands: bands_of(bands, reference),
    })
}

/// Quality alerts of the measurement (limits of `soglie_confronto/1`), empty if the spectrum has no usable grid.
fn alerts_of(s: &Spectrum, masked: &Spectrum) -> Vec<Alert> {
    let (Some(grid), Ok(q)) = (grid_absorbance(s), soglie::Thresholds::embedded()) else {
        return Vec::new();
    };
    quality_alerts(&grid, &masked.y, &q)
}

fn chain_steps() -> Vec<String> {
    json::parse(CHAIN)
        .ok()
        .and_then(|c| {
            c.get("steps")
                .and_then(Value::as_arr)
                .map(<[Value]>::to_vec)
        })
        .unwrap_or_default()
        .iter()
        .filter_map(|s| s.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

/// `detect` on a spectrum given as JSON `{wavenumber_cm1, y, y_unit?, role?, spectrum_id?}` with the thresholds as JSON
/// (empty = the embedded file). Returns `peaks/1` as JSON text.
pub fn detect_json(spectrum_json: &str, thresholds_json: &str) -> EngineResult<String> {
    let t = if thresholds_json.trim().is_empty() {
        Thresholds::embedded()?
    } else {
        Thresholds::parse(thresholds_json)?
    };
    let s = crate::confronti::opzioni::parse_query(spectrum_json)?;
    let id = json::parse(spectrum_json)?
        .get("spectrum_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut list = detect(&s, &t)?;
    list.spectrum_id = id;
    Ok(list.to_json())
}
