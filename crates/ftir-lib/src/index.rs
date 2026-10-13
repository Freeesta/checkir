//! `index.json` (`ftir-library-index/1`): one row per spectrum in the order of `data.bin`, so the page can search
//! and filter without opening the data.
use crate::{invalid, obj, string, text};
use ftir_core::error::{EngineError, EngineResult};
use ftir_core::passi::json::parse;
use ftir_core::passi::Value;

pub const SCHEMA: &str = "ftir-library-index/1";
const KEY: &str = "library.index_invalid";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub id: String,
    pub form: String,
    /// Optional identity (see `ftir-library-index/1`): with `inchikey`, rows sharing either are the same substance.
    pub substance: Option<String>,
    pub name_it: Option<String>,
    pub name_en: String,
    pub classes: Vec<String>,
    pub inchikey: Option<String>,
    /// `pass` or `warning` (the worst quality result; `fail` never enters a library).
    pub quality: String,
    pub provenance_type: String,
}

fn req<'a>(v: &'a Value, name: &str) -> EngineResult<&'a str> {
    text(v, name).ok_or_else(|| invalid(KEY, name))
}

fn parse_row(v: &Value) -> EngineResult<Row> {
    let names = v.get("names").ok_or_else(|| invalid(KEY, "names"))?;
    let classes = match v.get("classes").and_then(Value::as_arr) {
        Some(items) => items
            .iter()
            .map(|c| {
                c.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| invalid(KEY, "classes"))
            })
            .collect::<EngineResult<Vec<_>>>()?,
        None => return Err(invalid(KEY, "classes")),
    };
    let quality = req(v, "quality")?;
    if quality != "pass" && quality != "warning" {
        return Err(invalid(KEY, "quality"));
    }
    Ok(Row {
        id: req(v, "id")?.to_string(),
        form: req(v, "form")?.to_string(),
        substance: text(v, "substance").map(str::to_string),
        name_it: text(names, "it").map(str::to_string),
        name_en: req(names, "en")?.to_string(),
        classes,
        inchikey: text(v, "inchikey").map(str::to_string),
        quality: quality.to_string(),
        provenance_type: req(v, "provenance_type")?.to_string(),
    })
}

fn row_json(r: &Row) -> Value {
    let mut names = Vec::new();
    if let Some(it) = &r.name_it {
        names.push(("it", string(it)));
    }
    names.push(("en", string(&r.name_en)));
    let mut members = vec![
        ("id", string(&r.id)),
        ("form", string(&r.form)),
        ("names", obj(names)),
        (
            "classes",
            Value::Arr(r.classes.iter().map(|c| string(c)).collect()),
        ),
    ];
    if let Some(sub) = &r.substance {
        members.insert(2, ("substance", string(sub)));
    }
    if let Some(k) = &r.inchikey {
        members.push(("inchikey", string(k)));
    }
    members.push(("quality", string(&r.quality)));
    members.push(("provenance_type", string(&r.provenance_type)));
    obj(members)
}

/// Reads an index; two rows with the same id are `library.index_invalid` (field `id`).
pub fn parse_index(source: &str) -> EngineResult<Vec<Row>> {
    let v = parse(source).map_err(|_| invalid(KEY, "json"))?;
    match text(&v, "schema") {
        Some(SCHEMA) => {}
        Some(other) => {
            return Err(
                EngineError::new("library.schema_unknown", "unknown library schema")
                    .with_param("schema", other),
            )
        }
        None => return Err(invalid(KEY, "schema")),
    }
    let items = v
        .get("spectra")
        .and_then(Value::as_arr)
        .ok_or_else(|| invalid(KEY, "spectra"))?;
    let rows = items
        .iter()
        .map(parse_row)
        .collect::<EngineResult<Vec<_>>>()?;
    let mut ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    ids.sort_unstable();
    if ids.windows(2).any(|w| w.first() == w.get(1)) {
        return Err(invalid(KEY, "id"));
    }
    Ok(rows)
}

/// Compact JSON text of the index.
pub fn index_to_json(rows: &[Row]) -> String {
    obj(vec![
        ("schema", string(SCHEMA)),
        ("spectra", Value::Arr(rows.iter().map(row_json).collect())),
    ])
    .write()
}
