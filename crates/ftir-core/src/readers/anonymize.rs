//! Anonymous copy of a `Document`: every field marked `identity` is replaced by a stable pseudonym.
//!
//! Pseudonym = first 8 hex digits of HMAC-SHA-256(secret, key | value): the same value gives the same pseudonym for the same
//! secret, so the same operator or instrument stays recognisable across files without being named. The secret is local and
//! never exported. Dates are reduced to year and month. The original document is not touched.
#![warn(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation
)]
use super::jcamp::meta::iso_long_date;
use super::model::{Document, Field, Sourced, Spectrum, Warning};
use super::sha256::hmac_sha256;

/// Stable pseudonym such as `owner-3fa9c1d2`.
pub fn pseudonym(secret: &[u8], kind: &str, value: &str) -> String {
    let label: String = kind
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_lowercase())
        .collect();
    let mut msg = Vec::new();
    msg.extend_from_slice(label.as_bytes());
    msg.push(0);
    msg.extend_from_slice(value.trim().as_bytes());
    let mac = hmac_sha256(secret, &msg);
    let hex: String = mac.iter().take(4).map(|b| format!("{b:02x}")).collect();
    format!("{label}-{hex}")
}

/// `YYYY-MM` of an ISO 8601 date or of a JCAMP `LONG DATE`; `None` for anything else.
fn year_month(v: &str) -> Option<String> {
    let iso = iso_long_date(v).unwrap_or_else(|| v.to_string());
    let head = iso.get(..7)?;
    let ok = head.bytes().enumerate().all(|(i, b)| {
        if i == 4 {
            b == b'-'
        } else {
            b.is_ascii_digit()
        }
    });
    ok.then(|| head.to_string())
}

fn scrub_field(f: &mut Field, secret: &[u8]) {
    if !f.identity || f.value.trim().is_empty() {
        return;
    }
    let reduced = if f.key == "LONGDATE" {
        year_month(&f.value)
    } else {
        None
    };
    f.value = reduced.unwrap_or_else(|| pseudonym(secret, &f.key, &f.value));
}

fn scrub_sourced(s: &mut Option<Sourced<String>>, fields: &[Field]) {
    if let Some(v) = s {
        if let Some(f) = fields.get(v.field) {
            if f.identity {
                v.value = f.value.clone();
            }
        }
    }
}

fn scrub_warning(w: &mut Warning, secret: &[u8]) {
    if w.key == "reader.jcamp.date_ambiguous" {
        for (name, value) in &mut w.params {
            if *name == "value" {
                *value = pseudonym(secret, "date", value);
            }
        }
    }
}

fn scrub_spectrum(s: &mut Spectrum, secret: &[u8]) {
    for f in &mut s.fields {
        scrub_field(f, secret);
    }
    scrub_sourced(&mut s.measurement.title, &s.fields);
    scrub_sourced(&mut s.measurement.sample_name, &s.fields);
    scrub_sourced(&mut s.instrument.model, &s.fields);
    if let Some(d) = &mut s.measurement.datetime {
        d.value = year_month(&d.value).unwrap_or_else(|| pseudonym(secret, "date", &d.value));
    }
    s.history = s
        .history
        .iter()
        .map(|h| pseudonym(secret, "history", h))
        .collect();
    for w in &mut s.warnings {
        scrub_warning(w, secret);
    }
}

pub fn anonymize(doc: &Document, secret: &[u8]) -> Document {
    let mut out = doc.clone();
    for f in &mut out.fields {
        scrub_field(f, secret);
    }
    for w in &mut out.warnings {
        scrub_warning(w, secret);
    }
    for s in &mut out.spectra {
        scrub_spectrum(s, secret);
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn pseudonyms_are_stable_and_keyed() {
        let a = pseudonym(b"s1", "OWNER", "Mario Rossi");
        assert_eq!(a, pseudonym(b"s1", "OWNER", " Mario Rossi "));
        assert_ne!(a, pseudonym(b"s2", "OWNER", "Mario Rossi"));
        assert_ne!(a, pseudonym(b"s1", "OWNER", "Anna Bianchi"));
        assert!(a.starts_with("owner-") && a.len() == "owner-".len() + 8);
        assert!(!a.contains("Mario"));
    }

    #[test]
    fn dates_keep_year_and_month_only() {
        assert_eq!(
            year_month("2018/05/09 14:22:11").as_deref(),
            Some("2018-05")
        );
        assert_eq!(year_month("5/9/2018"), None);
    }
}
