//! Flagged families: `data/alerts/*.json` (`alerts/1`, embedded at build time like the thresholds) say which classes
//! of the library deserve an alert when a shown candidate belongs to them. The alert never raises the level: it only
//! tells the person that the candidate sits in a family that FTIR can hardly tell apart or that is active at low doses.
use super::indice::Index;
use super::livello::alert;
use super::risultato::{Alert, Candidate};
use crate::passi::json::{self, Value};

/// Candidates the page lists (the alert looks at these only).
pub const SHOWN: usize = 5;

const FILES: [&str; 5] = [
    include_str!("../../../../data/alerts/nitazenes.json"),
    include_str!("../../../../data/alerts/fentanyls.json"),
    include_str!("../../../../data/alerts/synthetic-cannabinoids.json"),
    include_str!("../../../../data/alerts/synthetic-cathinones.json"),
    include_str!("../../../../data/alerts/benzodiazepines.json"),
];

/// One flagged class: the alert it comes from and its first source.
#[derive(Debug, Clone, PartialEq)]
pub struct Flagged {
    pub alert: String,
    pub class: String,
    pub source: String,
    pub reason: String,
    pub severity: String,
}

/// The classes flagged by the embedded alerts that are not withdrawn, in file order.
pub fn flagged() -> Vec<Flagged> {
    let text = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let mut out = Vec::new();
    for f in FILES {
        let Ok(v) = json::parse(f) else { continue };
        if v.get("status").and_then(Value::as_str) == Some("withdrawn") {
            continue;
        }
        let source = v
            .get("sources")
            .and_then(Value::as_arr)
            .and_then(|a| a.first())
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let classes = v.get("target").and_then(|t| t.get("classes"));
        for c in classes.and_then(Value::as_arr).unwrap_or(&[]) {
            out.push(Flagged {
                alert: text(&v, "id"),
                class: c.as_str().unwrap_or("").to_string(),
                source: source.clone(),
                reason: text(&v, "reason"),
                severity: text(&v, "severity"),
            });
        }
    }
    out
}

/// One `family_flagged` alert per flagged class found among the first `SHOWN` candidates. The level is not touched.
pub fn family_alerts(index: &Index, candidates: &[Candidate]) -> Vec<Alert> {
    let mut out = Vec::new();
    for fl in flagged() {
        let hit = candidates
            .iter()
            .take(SHOWN)
            .enumerate()
            .find(|(_, c)| index.entry(c.g).classes.contains(&fl.class));
        let Some((rank, c)) = hit else { continue };
        let e = index.entry(c.g);
        let text = |s: &str| Value::Str(s.to_string());
        out.push(alert(
            "family_flagged",
            vec![
                ("class", text(&fl.class)),
                ("source", text(&fl.source)),
                ("alert", text(&fl.alert)),
                ("reason", text(&fl.reason)),
                ("severity", text(&fl.severity)),
                ("display_name", text(&e.display_name)),
                ("form", text(&e.form)),
                ("rank", Value::Num((rank + 1) as f64)),
            ],
        ));
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn the_embedded_alerts_flag_the_five_families() {
        let classes: Vec<String> = flagged().into_iter().map(|f| f.class).collect();
        assert_eq!(
            classes,
            [
                "nitazenes",
                "fentanyls",
                "synthetic_cannabinoids",
                "synthetic_cathinones",
                "benzodiazepines"
            ]
        );
        assert!(flagged().iter().all(|f| !f.source.is_empty()));
    }
}
