//! The answers of several libraries as one list. Order: bands found, summed prominence in the library spectrum, summed |Δ|,
//! then the order in which the libraries were given and the order inside each answer. The page shows the list as it comes.
use super::query::{hit_value, Hit, QueryResult};
use crate::passi::json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct Ranked {
    /// Spectra that satisfy the query in all the libraries (before each library's `limit`).
    pub total: usize,
    /// True when a library had more spectra than it returned.
    pub truncated: bool,
    /// `(library, hit)`; the spectrum of a hit is a row of that library.
    pub hits: Vec<(String, Hit)>,
}

/// Merge the answers of the libraries (`(library id, answer)`, in the order of the active libraries).
pub fn rank(parts: Vec<(String, QueryResult)>) -> Ranked {
    let total = parts.iter().map(|(_, r)| r.total).sum();
    let truncated = parts.iter().any(|(_, r)| r.total > r.hits.len());
    let mut hits: Vec<(String, Hit)> = parts
        .into_iter()
        .flat_map(|(lib, r)| r.hits.into_iter().map(move |h| (lib.clone(), h)))
        .collect();
    hits.sort_by(|(_, a), (_, b)| {
        b.found
            .len()
            .cmp(&a.found.len())
            .then(b.prominence_sum().cmp(&a.prominence_sum()))
            .then(a.delta_sum().total_cmp(&b.delta_sum()))
    });
    Ranked {
        total,
        truncated,
        hits,
    }
}

impl Ranked {
    /// `{total, truncated, missing, failed, hits:[{lib, spectrum, found, bands}]}`; `missing` = libraries without an
    /// index yet, `failed` = libraries whose query the engine refused.
    pub fn to_json(&self, missing: &[String], failed: usize) -> String {
        let hit = |(lib, h): &(String, Hit)| match hit_value(h) {
            Value::Obj(mut o) => {
                o.insert(0, ("lib".into(), Value::Str(lib.clone())));
                Value::Obj(o)
            }
            other => other,
        };
        Value::Obj(vec![
            ("total".into(), Value::Num(self.total as f64)),
            ("truncated".into(), Value::Bool(self.truncated)),
            (
                "missing".into(),
                Value::Arr(missing.iter().cloned().map(Value::Str).collect()),
            ),
            ("failed".into(), Value::Num(failed as f64)),
            (
                "hits".into(),
                Value::Arr(self.hits.iter().map(hit).collect()),
            ),
        ])
        .write()
    }
}
