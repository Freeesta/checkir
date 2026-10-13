//! Minimal JSON value, parser and writer for step parameters and chains (no dependencies).
use crate::error::{EngineError, EngineResult};

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(o) => o.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&[Value]> {
        match self {
            Value::Arr(a) => Some(a),
            _ => None,
        }
    }

    /// Compact JSON text; object keys keep their order.
    pub fn write(&self) -> String {
        match self {
            Value::Null => "null".into(),
            Value::Bool(b) => b.to_string(),
            Value::Num(n) => format!("{n}"),
            Value::Str(s) => quote(s),
            Value::Arr(a) => format!(
                "[{}]",
                a.iter().map(Value::write).collect::<Vec<_>>().join(",")
            ),
            Value::Obj(o) => {
                let items: Vec<String> = o
                    .iter()
                    .map(|(k, v)| format!("{}:{}", quote(k), v.write()))
                    .collect();
                format!("{{{}}}", items.join(","))
            }
        }
    }
}

/// Parse a JSON text (nesting limited to 32 levels).
pub fn parse(text: &str) -> EngineResult<Value> {
    let mut p = Parser {
        b: text.as_bytes(),
        i: 0,
        depth: 0,
    };
    let v = p.value()?;
    p.ws();
    if p.i != p.b.len() {
        return Err(bad(p.i));
    }
    Ok(v)
}

fn quote(s: &str) -> String {
    let mut o = String::from("\"");
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

fn bad(at: usize) -> EngineError {
    EngineError::new("passi.json_non_valido", "invalid JSON").with_param("pos", at)
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
    depth: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.b.get(self.i).is_some_and(|c| c.is_ascii_whitespace()) {
            self.i += 1;
        }
    }

    fn eat(&mut self, c: u8) -> EngineResult<()> {
        self.ws();
        if self.b.get(self.i) == Some(&c) {
            self.i += 1;
            Ok(())
        } else {
            Err(bad(self.i))
        }
    }

    fn lit(&mut self, word: &str, v: Value) -> EngineResult<Value> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(bad(self.i))
        }
    }

    fn value(&mut self) -> EngineResult<Value> {
        self.ws();
        self.depth += 1;
        if self.depth > 32 {
            return Err(bad(self.i));
        }
        let v = match self.b.get(self.i) {
            Some(b'{') => self.object(),
            Some(b'[') => self.array(),
            Some(b'"') => self.string().map(Value::Str),
            Some(b't') => self.lit("true", Value::Bool(true)),
            Some(b'f') => self.lit("false", Value::Bool(false)),
            Some(b'n') => self.lit("null", Value::Null),
            Some(_) => self.number(),
            None => Err(bad(self.i)),
        }?;
        self.depth -= 1;
        Ok(v)
    }

    fn number(&mut self) -> EngineResult<Value> {
        let start = self.i;
        while self
            .b
            .get(self.i)
            .is_some_and(|c| matches!(c, b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E'))
        {
            self.i += 1;
        }
        let t = std::str::from_utf8(&self.b[start..self.i]).map_err(|_| bad(start))?;
        match t.parse::<f64>() {
            Ok(n) if n.is_finite() => Ok(Value::Num(n)),
            _ => Err(bad(start)),
        }
    }

    fn string(&mut self) -> EngineResult<String> {
        self.eat(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            let c = *self.b.get(self.i).ok_or_else(|| bad(self.i))?;
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let e = *self.b.get(self.i).ok_or_else(|| bad(self.i))?;
                    self.i += 1;
                    match e {
                        b'n' => out.push(b'\n'),
                        b't' => out.push(b'\t'),
                        b'r' => out.push(b'\r'),
                        b'"' | b'\\' | b'/' => out.push(e),
                        b'u' => {
                            let h = self.b.get(self.i..self.i + 4).ok_or_else(|| bad(self.i))?;
                            let h = std::str::from_utf8(h).map_err(|_| bad(self.i))?;
                            let cp = u32::from_str_radix(h, 16).map_err(|_| bad(self.i))?;
                            let ch = char::from_u32(cp).ok_or_else(|| bad(self.i))?;
                            out.extend_from_slice(ch.to_string().as_bytes());
                            self.i += 4;
                        }
                        _ => return Err(bad(self.i)),
                    }
                }
                c => out.push(c),
            }
        }
        String::from_utf8(out).map_err(|_| bad(self.i))
    }

    fn array(&mut self) -> EngineResult<Value> {
        self.eat(b'[')?;
        let mut a = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b']') {
            self.i += 1;
            return Ok(Value::Arr(a));
        }
        loop {
            a.push(self.value()?);
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    return Ok(Value::Arr(a));
                }
                _ => return Err(bad(self.i)),
            }
        }
    }

    fn object(&mut self) -> EngineResult<Value> {
        self.eat(b'{')?;
        let mut o = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b'}') {
            self.i += 1;
            return Ok(Value::Obj(o));
        }
        loop {
            self.ws();
            let k = self.string()?;
            self.eat(b':')?;
            o.push((k, self.value()?));
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Value::Obj(o));
                }
                _ => return Err(bad(self.i)),
            }
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn round_trip_and_errors() {
        let t = r#"{"a":[1,2.5,-3e2],"b":"x\"y","c":{"d":true,"e":null}}"#;
        let v = parse(t).unwrap();
        assert_eq!(
            v.get("a").unwrap().as_arr().unwrap()[2].as_f64(),
            Some(-300.0)
        );
        assert_eq!(parse(&v.write()).unwrap(), v);
        for bad in ["", "{", "[1,]", "{\"a\"}", "1 2", "nul", "[1e999]"] {
            assert!(parse(bad).is_err(), "{bad}");
        }
        assert!(parse(&"[".repeat(40)).is_err());
    }
}
