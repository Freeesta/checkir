//! Processing steps registry (`STEPS`): the implementations live in `crate::passi`. Adding a step = a file there + one line here.
use crate::error::EngineResult;
use crate::passi::{griglia, maschera, normalizza, savitzky_golay, trasmittanza};
use crate::spectrum::Spectrum;

/// Version of the step contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One step: a pure function from spectrum to spectrum, with a versioned id.
pub struct Step {
    pub id: &'static str,
    pub version: u32,
    pub contract: u32,
    pub apply: fn(&Spectrum, &str) -> EngineResult<Spectrum>,
    /// Parameters, one `name: type` per key, as a JSON object of descriptions.
    pub params_schema: &'static str,
    /// Default parameters as JSON; `apply` with `{}` behaves like `apply` with these.
    pub defaults: &'static str,
    /// `id/version` of the step that undoes this one, when it exists.
    pub inverse: Option<&'static str>,
}

pub static STEPS: &[Step] = &[
    trasmittanza::FORWARD,
    trasmittanza::INVERSE,
    griglia::STEP,
    maschera::STEP,
    savitzky_golay::STEP,
    normalizza::STEP,
];

/// The step with this `id/version` (e.g. `griglia/1`).
pub fn find(id_version: &str) -> Option<&'static Step> {
    STEPS
        .iter()
        .find(|s| id_version == format!("{}/{}", s.id, s.version))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::passi::json;
    use crate::synthetic::{generate, Params};

    #[test]
    fn conformance() {
        let s = generate(&Params::demo());
        let mut ids = std::collections::HashSet::new();
        for p in STEPS {
            assert_eq!(p.contract, CONTRACT, "{}", p.id);
            assert!(ids.insert(p.id), "duplicate id {}", p.id);
            let name = format!("{}/{}", p.id, p.version);
            assert!(find(&name).is_some());
            assert!(
                json::parse(p.params_schema).is_ok() && json::parse(p.defaults).is_ok(),
                "{name}"
            );
            let r = (p.apply)(&s, "{}").unwrap_or_else(|e| panic!("{name}: {}", e.error));
            let d = (p.apply)(&s, p.defaults).unwrap_or_else(|e| panic!("{name}: {}", e.error));
            let bits = |v: &Spectrum| v.y.iter().map(|y| y.to_bits()).collect::<Vec<_>>();
            assert!(
                bits(&r) == bits(&d) && r.history == d.history,
                "{name}: {{}} must equal the defaults"
            );
            assert_eq!(r.role, s.role, "{name}");
            if r.history.last() != s.history.last() {
                assert!(
                    r.history.last().is_some_and(|h| h.starts_with(&name)),
                    "{name}"
                );
            }
            if let Some(inv) = p.inverse {
                assert_eq!(
                    find(inv).and_then(|i| i.inverse),
                    Some(name.as_str()),
                    "{name}"
                );
            }
            assert!(
                (p.apply)(&s, "{\"zz\":1}").is_err(),
                "{name}: unknown key must fail"
            );
        }
    }
}
