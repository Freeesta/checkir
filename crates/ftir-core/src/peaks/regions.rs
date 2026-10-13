//! The didactic IR regions (`data/bands/regions.json`, schema `regions/1`), read only to tag peaks and bands with the
//! regions they fall in. Regions overlap (a salt N-H⁺ envelope sits under the C-H stretches), so a peak may have several.
use crate::passi::json::{self, Value};

const REGIONS_JSON: &str = include_str!("../../../../data/bands/regions.json");

/// `(id, min_cm1, max_cm1)` of every region in the file; unreadable entries are skipped.
fn table() -> Vec<(String, f64, f64)> {
    let Ok(doc) = json::parse(REGIONS_JSON) else {
        return Vec::new();
    };
    let list = doc.get("regions").and_then(Value::as_arr).unwrap_or(&[]);
    list.iter()
        .filter_map(|r| {
            let range = r.get("range_cm1")?;
            Some((
                r.get("id")?.as_str()?.to_string(),
                range.get("min")?.as_f64()?,
                range.get("max")?.as_f64()?,
            ))
        })
        .collect()
}

/// Ids of the regions that overlap `[from, to]` (a point is `from == to`), in file order.
pub fn ids_for(from_cm1: f64, to_cm1: f64) -> Vec<String> {
    table()
        .into_iter()
        .filter(|(_, lo, hi)| from_cm1 <= *hi && to_cm1 >= *lo)
        .map(|(id, _, _)| id)
        .collect()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn a_point_gets_every_region_that_contains_it() {
        assert_eq!(ids_for(1700.0, 1700.0), vec!["carbonyl"]);
        let n = ids_for(3000.0, 3000.0);
        assert!(n.contains(&"ch_stretch".to_string()) && n.contains(&"salt_nh".to_string()));
        assert!(ids_for(2100.0, 2100.0).contains(&"instrument".to_string()));
        assert_eq!(table().len(), 10);
    }
}
