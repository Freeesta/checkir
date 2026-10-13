//! Identity table for the builder (`--identity file.csv`, columns `name,inchikey,substance`): maps the name of a row to
//! its InChIKey and/or substance id, so rows named differently across libraries ("92 MDMA_0", "MDMA") are one substance.
use crate::index::Row;
use std::collections::HashMap;

/// What the table says about one name; an empty cell stays `None`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub inchikey: Option<String>,
    pub substance: Option<String>,
}

/// Name as compared: lowercase letters and digits, single spaces.
pub fn key(name: &str) -> String {
    let lower: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_lowercase().next().unwrap_or(c)
            } else {
                ' '
            }
        })
        .collect();
    lower.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn fields(line: &str) -> Vec<String> {
    let (mut out, mut cur, mut quoted) = (Vec::new(), String::new(), false);
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => out.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out.iter().map(|f| f.trim().to_string()).collect()
}

fn is_inchikey(s: &str) -> bool {
    let p: Vec<&str> = s.split('-').collect();
    p.len() == 3
        && [14, 10, 1]
            .iter()
            .zip(&p)
            .all(|(n, x)| x.len() == *n && x.chars().all(|c| c.is_ascii_uppercase()))
}

fn is_slug(s: &str) -> bool {
    !s.is_empty()
        && s.split('-').all(|w| {
            !w.is_empty()
                && w.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

/// Reads the table. The header names the columns (`name` required, `inchikey` and `substance` optional, any order);
/// a bad InChIKey or substance id, an empty name or a name repeated with another identity is an error naming the line.
pub fn parse_table(csv: &str) -> Result<HashMap<String, Identity>, String> {
    let mut lines = csv.lines().filter(|l| !l.trim().is_empty());
    let header = fields(lines.next().ok_or("identity table: empty file")?);
    let col = |n: &str| header.iter().position(|h| h.eq_ignore_ascii_case(n));
    let name_col = col("name").ok_or("identity table: no `name` column")?;
    let (ik_col, sub_col) = (col("inchikey"), col("substance"));
    let mut table: HashMap<String, Identity> = HashMap::new();
    for (n, line) in lines.enumerate() {
        let f = fields(line);
        let cell = |c: Option<usize>| c.and_then(|c| f.get(c)).filter(|v| !v.is_empty()).cloned();
        let at = |what: &str| format!("identity table, row {}: {what}", n + 2);
        let name = f.get(name_col).filter(|v| !v.is_empty());
        let name = key(name.ok_or_else(|| at("empty name"))?);
        let id = Identity {
            inchikey: cell(ik_col),
            substance: cell(sub_col),
        };
        if id.inchikey.as_deref().is_some_and(|k| !is_inchikey(k)) {
            return Err(at("not an InChIKey"));
        }
        if id.substance.as_deref().is_some_and(|s| !is_slug(s)) {
            return Err(at("not a substance id"));
        }
        if table.get(&name).is_some_and(|old| *old != id) {
            return Err(at("the name appears with two different identities"));
        }
        table.insert(name, id);
    }
    Ok(table)
}

/// Gives each row the identity of its English name (else Italian). Cells the table leaves empty do not change the row.
/// Returns the names (English) of the rows the table does not know, once each, in order of appearance.
pub fn apply(rows: &mut [Row], table: &HashMap<String, Identity>) -> Vec<String> {
    let mut unknown: Vec<String> = Vec::new();
    for r in rows {
        let found = table
            .get(&key(&r.name_en))
            .or_else(|| r.name_it.as_deref().and_then(|n| table.get(&key(n))));
        match found {
            Some(id) => {
                if id.inchikey.is_some() {
                    r.inchikey.clone_from(&id.inchikey);
                }
                if id.substance.is_some() {
                    r.substance.clone_from(&id.substance);
                }
            }
            None if !unknown.contains(&r.name_en) => unknown.push(r.name_en.clone()),
            None => {}
        }
    }
    unknown
}
