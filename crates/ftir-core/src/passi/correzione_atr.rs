//! `correzione_atr/1`: multiplies the absorbance by `ν / ν_rif` (`ref_cm1`, default 1000 cm⁻¹). Off by default and
//! meant ONLY for references measured in transmission (KBr, film): the service libraries are ATR and applying it
//! between ATR spectra makes the search worse (first place 0.871 → 0.831 on the test bench). It corrects the
//! intensities, not the band positions (the ATR shift to lower wavenumbers stays), and it does not improve the search
//! against a transmission library (Thermo AN 50581: 67.0 → 68.9; the advanced correction 98.5). Absent points stay absent.
use super::{finite_axis, invalid, num, obj, params, result, Value};
use crate::error::EngineResult;
use crate::spectrum::{Spectrum, YUnit};
use crate::steps::Step;

pub const STEP: Step = Step {
    id: "correzione_atr",
    version: 1,
    contract: 1,
    apply,
    params_schema: r#"{"ref_cm1":"number > 0"}"#,
    defaults: r#"{"ref_cm1":1000}"#,
    inverse: None,
};

pub fn apply(s: &Spectrum, text_params: &str) -> EngineResult<Spectrum> {
    let p = params(text_params, &["ref_cm1"])?;
    let r = num(&p, "ref_cm1", 1000.0)?;
    if !(r.is_finite() && r > 0.0) {
        return Err(invalid("ref_cm1", "expected a positive number"));
    }
    finite_axis(s)?;
    if s.y_unit != YUnit::Absorbance {
        return Err(invalid("y_unit", "the ATR correction works on absorbance"));
    }
    let y =
        s.y.iter()
            .zip(&s.wavenumber_cm1)
            .map(|(y, x)| y * x / r)
            .collect();
    let used = obj(vec![("ref_cm1", Value::Num(r))]);
    Ok(result(
        s,
        "correzione_atr/1",
        &used,
        s.y_unit,
        s.wavenumber_cm1.clone(),
        y,
    ))
}
