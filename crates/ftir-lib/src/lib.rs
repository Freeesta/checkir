//! Compact spectral libraries (`ftir-library/1`): the manifest, the index and the binary data of one package,
//! with SHA-256 and size checks on every read, and the conversion of reference spectra onto the common grid.
//! Pure functions on bytes and text; files are read and written by the callers.
#![forbid(unsafe_code)]

pub mod bridge;
pub mod build;
pub mod data;
pub mod files;
pub mod identity;
pub mod index;
pub mod manifest;
pub mod package;

use ftir_core::error::EngineError;
use ftir_core::passi::Value;

/// Library errors reuse the engine error: `{error, error_key, params}`, keys `library.<case>` translated by the page.
pub(crate) fn invalid(key: &'static str, field: &str) -> EngineError {
    EngineError::new(key, "invalid library document").with_param("field", field)
}

/// A string member of a JSON object.
pub(crate) fn text<'a>(v: &'a Value, name: &str) -> Option<&'a str> {
    v.get(name).and_then(Value::as_str)
}

/// The `sampling` member: `None` when absent or `unknown`; an id outside the list is an error naming the member (`key`).
pub(crate) fn sampling(
    v: &Value,
    key: &'static str,
) -> ftir_core::error::EngineResult<Option<String>> {
    match text(v, "sampling") {
        None => Ok(None),
        Some(id) if ftir_core::campionamento::known(id).is_some() => {
            Ok(ftir_core::campionamento::normalise(id).map(str::to_string))
        }
        Some(_) => Err(invalid(key, "sampling")),
    }
}

/// A JSON object from its members.
pub(crate) fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Obj(
        members
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect(),
    )
}

pub(crate) fn string(s: &str) -> Value {
    Value::Str(s.to_string())
}
