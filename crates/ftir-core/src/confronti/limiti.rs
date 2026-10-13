//! The numbers the page needs to lay out a comparison (grid, excluded zone, smallest region), read from the engine so the
//! page keeps no copy: the grid and the mask are the constants of the comparison, the smallest region comes from
//! `range_limits` of `soglie_confronto.json`.
use super::soglie::Thresholds;
use super::{GRID_FROM_CM1, GRID_N, GRID_STEP_CM1, MASK_CM1};
use crate::error::EngineResult;

/// `{"grid":{"from_cm1","to_cm1","step_cm1"},"mask_cm1":[from,to],"range_limits":{"min_cm1","min_points"}}`.
pub fn limiti_json() -> EngineResult<String> {
    let t = Thresholds::embedded()?;
    let to = GRID_FROM_CM1 + GRID_STEP_CM1 * (GRID_N - 1) as f64;
    Ok(format!(
        "{{\"grid\":{{\"from_cm1\":{},\"to_cm1\":{},\"step_cm1\":{}}},\"mask_cm1\":[{},{}],\"range_limits\":{{\"min_cm1\":{},\"min_points\":{}}}}}",
        GRID_FROM_CM1, to, GRID_STEP_CM1, MASK_CM1.0, MASK_CM1.1, t.min_cm1, t.min_points
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_numbers_are_the_comparison_ones() {
        let j = crate::passi::json::parse(&limiti_json().expect("limits")).expect("json");
        assert_eq!(
            j.get("grid")
                .and_then(|g| g.get("to_cm1"))
                .and_then(|v| v.as_f64()),
            Some(3800.0)
        );
        assert_eq!(
            j.get("range_limits")
                .and_then(|g| g.get("min_points"))
                .and_then(|v| v.as_f64()),
            Some(150.0)
        );
    }
}
