//! Errors as translatable keys: `{error, error_key, params}`.

/// An engine error. `error_key` is translated by the page; `error` is an English fallback for logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError {
    pub error: String,
    pub error_key: &'static str,
    pub params: Vec<(&'static str, String)>,
}

impl EngineError {
    pub fn new(error_key: &'static str, error: &str) -> Self {
        Self {
            error: error.to_string(),
            error_key,
            params: Vec::new(),
        }
    }

    pub fn with_param(mut self, name: &'static str, value: impl ToString) -> Self {
        self.params.push((name, value.to_string()));
        self
    }

    /// JSON text `{"error":..., "error_key":..., "params":{...}}`.
    pub fn json(&self) -> String {
        let params: Vec<String> = self
            .params
            .iter()
            .map(|(k, v)| format!("\"{}\":{}", k, json_str(v)))
            .collect();
        format!(
            "{{\"error\":{},\"error_key\":\"{}\",\"params\":{{{}}}}}",
            json_str(&self.error),
            self.error_key,
            params.join(",")
        )
    }
}

fn json_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

pub type EngineResult<T> = Result<T, EngineError>;

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn json_is_escaped() {
        let e = EngineError::new("error.demo", "bad \"x\"\n").with_param("n", 3);
        assert_eq!(
            e.json(),
            "{\"error\":\"bad \\\"x\\\"\\n\",\"error_key\":\"error.demo\",\"params\":{\"n\":\"3\"}}"
        );
    }
}
