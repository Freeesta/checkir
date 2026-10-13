//! The stored form of the index: `u32` little-endian header length, the header (JSON `peak-index/1`, schema in
//! `docs/schemi/peak-index-1.json`), then the rows (8 bytes each). A cache: a different chain, thresholds or library
//! version is refused and the page rebuilds the index from the spectra.
use super::{PeakIndex, Row, MIN_PROMINENCE_REL, ROW_BYTES, SCHEMA};
use crate::error::{EngineError, EngineResult};
use crate::passi::json::{self, Value};

impl PeakIndex {
    /// The header as JSON `peak-index/1`.
    pub fn header_json(&self, library_version: &str) -> String {
        Value::Obj(vec![
            ("schema".into(), text(SCHEMA)),
            ("library_version".into(), text(library_version)),
            ("chain_id".into(), text(&self.chain_id)),
            (
                "thresholds_version".into(),
                Value::Num(f64::from(self.thresholds_version)),
            ),
            ("min_prominence_rel".into(), Value::Num(MIN_PROMINENCE_REL)),
            ("row_bytes".into(), Value::Num(ROW_BYTES as f64)),
            ("spectra".into(), Value::Num(f64::from(self.spectra()))),
            ("rows".into(), Value::Num(self.rows().len() as f64)),
        ])
        .write()
    }

    /// Header and rows as one blob to keep locally.
    pub fn to_bytes(&self, library_version: &str) -> Vec<u8> {
        let head = self.header_json(library_version);
        let mut out = Vec::with_capacity(4 + head.len() + self.rows().len() * ROW_BYTES);
        out.extend_from_slice(&(head.len() as u32).to_le_bytes());
        out.extend_from_slice(head.as_bytes());
        for r in self.rows() {
            out.extend_from_slice(&r.pos10.to_le_bytes());
            out.push(r.prominence);
            out.push(r.width);
            out.extend_from_slice(&r.spectrum.to_le_bytes());
        }
        out
    }

    /// Reads a blob made by `to_bytes`. The chain, the thresholds version and the library version must be the current ones.
    pub fn from_bytes(
        bytes: &[u8],
        chain_id: &str,
        thresholds_version: u32,
        library_version: &str,
    ) -> EngineResult<Self> {
        let n = bytes
            .get(..4)
            .and_then(|b| <[u8; 4]>::try_from(b).ok())
            .ok_or_else(|| damaged("length"))?;
        let end = 4 + u32::from_le_bytes(n) as usize;
        let head = bytes
            .get(4..end)
            .and_then(|b| std::str::from_utf8(b).ok())
            .ok_or_else(|| damaged("header"))?;
        let h = json::parse(head).map_err(|_| damaged("header"))?;
        let get = |k: &str| h.get(k).and_then(Value::as_f64);
        let same = h.get("schema").and_then(Value::as_str) == Some(SCHEMA)
            && h.get("chain_id").and_then(Value::as_str) == Some(chain_id)
            && h.get("library_version").and_then(Value::as_str) == Some(library_version)
            && get("thresholds_version") == Some(f64::from(thresholds_version))
            && get("row_bytes") == Some(ROW_BYTES as f64);
        if !same {
            return Err(EngineError::new(
                "peak_index.obsolete",
                "peak index of another version",
            ));
        }
        let (spectra, rows) = (
            get("spectra").ok_or_else(|| damaged("spectra"))?,
            get("rows").ok_or_else(|| damaged("rows"))?,
        );
        let body = bytes.get(end..).unwrap_or_default();
        if rows < 0.0
            || body.len() as f64 != rows * ROW_BYTES as f64
            || spectra < 0.0
            || spectra > f64::from(u32::MAX)
        {
            return Err(damaged("size"));
        }
        let rows: Vec<Row> = body.chunks_exact(ROW_BYTES).map(read_row).collect();
        let sorted = rows.windows(2).all(|w| w[0].pos10 <= w[1].pos10);
        if !sorted || rows.iter().any(|r| f64::from(r.spectrum) >= spectra) {
            return Err(damaged("rows"));
        }
        Ok(Self::from_parts(
            chain_id.to_string(),
            thresholds_version,
            spectra as u32,
            rows,
        ))
    }
}

fn read_row(c: &[u8]) -> Row {
    let at = |i: usize| c.get(i).copied().unwrap_or_default();
    Row {
        pos10: u16::from_le_bytes([at(0), at(1)]),
        prominence: at(2),
        width: at(3),
        spectrum: u32::from_le_bytes([at(4), at(5), at(6), at(7)]),
    }
}

fn damaged(what: &str) -> EngineError {
    EngineError::new("peak_index.damaged", "damaged peak index").with_param("what", what)
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}
