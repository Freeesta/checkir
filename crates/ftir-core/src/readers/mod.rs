//! Readers registry (`READERS`), contract `ftir-reader/1`: one file per format and one line in the registry.
pub mod anonymize;
pub mod bdb;
pub mod export;
pub mod ispd;
pub mod jcamp;
pub(crate) mod le;
pub mod model;
pub mod opus;
pub mod sha256;
pub mod shimadzu_lib;
pub mod spa;
pub mod spc;
pub mod text;

use model::{Confidence, Document, Limits, Options, ReadResult};

/// Version of the reader contract this registry accepts.
pub const CONTRACT: u32 = 1;

/// One reader. Pure functions: bytes in, data out; the same input gives the same output byte for byte.
pub struct Reader {
    pub id: &'static str,
    pub version: &'static str,
    pub contract: u32,
    /// Looks at the content first (signature), then at the extension.
    pub detect: fn(&str, &[u8]) -> Confidence,
    pub open: fn(&[u8], &Limits, &Options) -> ReadResult<Document>,
}

pub static READERS: &[Reader] = &[
    jcamp::READER,
    text::READER,
    ispd::READER,
    shimadzu_lib::READER,
    spa::READER,
    spc::READER,
    opus::READER,
];

/// Picks the reader that is surest about the file; ties go to the registry order.
pub fn pick(name: &str, head: &[u8]) -> Option<&'static Reader> {
    let mut best: Option<(&'static Reader, Confidence)> = None;
    for r in READERS {
        let c = (r.detect)(name, head);
        if c != Confidence::No && best.is_none_or(|(_, b)| c > b) {
            best = Some((r, c));
        }
    }
    best.map(|(r, _)| r)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn conformance() {
        let mut ids = std::collections::HashSet::new();
        for r in READERS {
            assert_eq!(r.contract, CONTRACT, "{}", r.id);
            assert!(ids.insert(r.id), "duplicate id {}", r.id);
            assert!(!r.version.is_empty(), "{}", r.id);
            let empty: &[u8] = &[];
            assert_eq!((r.detect)("", empty), Confidence::No, "{}", r.id);
            let opts = Options::default();
            assert!(
                (r.open)(empty, &Limits::STANDARD, &opts).is_err(),
                "{}",
                r.id
            );
            let tiny = Limits {
                max_bytes: 4,
                ..Limits::STANDARD
            };
            let e = (r.open)(b"##TITLE=x\n", &tiny, &opts).unwrap_err();
            assert_eq!(e.key, "reader.limit_exceeded", "{}", r.id);
        }
    }

    #[test]
    fn pick_prefers_content() {
        let r = pick("x.bin", b"##TITLE=a\r\n##JCAMP-DX=4.24\r\n");
        assert_eq!(r.map(|r| r.id), Some("jcamp-dx"));
        assert!(pick("x.bin", b"hello").is_none());
    }
}
