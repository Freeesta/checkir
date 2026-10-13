//! An r read on its own against the limits of `region_agreement`: what the range table of the page asks for each cell.
use super::soglie::{RegionAgreement, Thresholds};
use crate::error::{EngineError, EngineResult};
use crate::passi::json;

impl RegionAgreement {
    /// State of an r with no share of signal to judge: `unknown` without a finite r, else `agrees` / `partial` / `disagrees`.
    pub fn state_of_r(&self, r: f64) -> &'static str {
        self.state(Some(r), 1.0)
    }

    /// The limits as a result carries them (`{agree_min, partial_min, signal_share_min}`); empty text = the embedded ones.
    pub fn from_json(text: &str) -> EngineResult<Self> {
        if text.trim().is_empty() {
            return Ok(Thresholds::embedded()?.region_agreement);
        }
        let v = json::parse(text)?;
        let a = |k: &str| {
            v.get(k).and_then(json::Value::as_f64).ok_or_else(|| {
                EngineError::new("confronti.soglie_non_valide", "invalid thresholds file")
                    .with_param("campo", k)
            })
        };
        Ok(Self {
            agree_min: a("agree_min")?,
            partial_min: a("partial_min")?,
            signal_share_min: a("signal_share_min")?,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn an_r_alone_is_read_with_the_limits_of_the_result() {
        let a = RegionAgreement::from_json("").expect("embedded");
        assert_eq!(a.state_of_r(0.95), "agrees");
        assert_eq!(a.state_of_r(0.8), "partial");
        assert_eq!(a.state_of_r(0.3), "disagrees");
        assert_eq!(a.state_of_r(f64::NAN), "unknown");
        let own = RegionAgreement::from_json(
            r#"{"agree_min":0.5,"partial_min":0.2,"signal_share_min":0.01}"#,
        )
        .expect("limits");
        assert_eq!(own.state_of_r(0.6), "agrees");
        assert!(RegionAgreement::from_json("{}").is_err());
    }
}
