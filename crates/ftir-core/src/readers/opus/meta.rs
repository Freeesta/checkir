//! Fields (one per parameter, text block and data block) and the standard metadata taken from them.
use super::params::{Param, Value};
use crate::readers::model::{Field, FieldKind, Sourced, Spectrum};
use crate::readers::sha256::sha256_hex;

/// Keys the reader knows (`prefix.NAME`, or the key of a block); each has an action in the contract `anonimizza/1`.
pub const KNOWN: &[&str] = &[
    "AB",
    "ACQ.AQM",
    "ACQ.HFW",
    "ACQ.LFW",
    "ACQ.NSS",
    "ACQ.RES",
    "CURVEFIT",
    "DATA.CSF",
    "DATA.DAT",
    "DATA.DPF",
    "DATA.DXU",
    "DATA.FXV",
    "DATA.LXV",
    "DATA.MNY",
    "DATA.MXY",
    "DATA.NPT",
    "DATA.TIM",
    "FT.APF",
    "FT.PHZ",
    "FT.ZFF",
    "HISTORY",
    "IGRF",
    "IGSM",
    "INST.APT",
    "INST.BMS",
    "INST.DTC",
    "INST.HFQ",
    "INST.INS",
    "INST.LFQ",
    "INST.LWN",
    "INST.SRC",
    "INST.SRN",
    "INST.VEL",
    "INTEGRATION",
    "PHSM",
    "SCRF",
    "SCSM",
    "SIGNATURE",
    "SMP.CNM",
    "SMP.SFM",
    "SMP.SNM",
];

/// Text parameters that name a physical setting, never a person, a place or a sample: every other text is `identity`.
const PHYSICAL_TEXT: &[&str] = &[
    "ACQ.AQM", "DATA.DXU", "FT.APF", "FT.PHZ", "INST.APT", "INST.BMS", "INST.DTC", "INST.INS",
    "INST.SRC",
];

fn field(
    origin: String,
    key: &str,
    name: &str,
    value: String,
    kind: FieldKind,
    identity: bool,
) -> Field {
    Field {
        origin,
        key: key.to_string(),
        original_key: name.to_string(),
        value,
        kind,
        unit: None,
        mapped: None,
        identity,
        known: KNOWN.contains(&key),
    }
}

/// One field per parameter of a block, in the order of the file.
pub fn param_fields(prefix: &str, n: usize, params: &[Param]) -> Vec<Field> {
    params
        .iter()
        .map(|p| {
            let key = format!("{prefix}.{}", p.name);
            let (value, kind) = match &p.value {
                Value::Int(v) => (v.to_string(), FieldKind::Integer),
                Value::Real(v) => (v.to_string(), FieldKind::Real),
                Value::Text(t) => (t.clone(), FieldKind::Text),
                Value::Raw(b) => (describe(b), FieldKind::Bytes),
            };
            let date = key == "DATA.DAT";
            let identity =
                date || (kind == FieldKind::Text && !PHYSICAL_TEXT.contains(&key.as_str()));
            let kind = if date { FieldKind::Date } else { kind };
            field(
                format!("block {n} · {prefix} · {}", p.name),
                &key,
                &p.name,
                value,
                kind,
                identity,
            )
        })
        .collect()
}

fn describe(b: &[u8]) -> String {
    format!("{} bytes, sha256 {}", b.len(), sha256_hex(b))
}

/// A block kept as length and digest, never copied (data series, unknown blocks).
pub fn bytes_field(key: &str, n: usize, b: &[u8]) -> Field {
    field(
        format!("block {n} · {key}"),
        key,
        key,
        describe(b),
        FieldKind::Bytes,
        false,
    )
}

/// A text block (history, signature…): free text, so `identity`.
pub fn text_field(key: &str, n: usize, b: &[u8]) -> Field {
    let body = b.split(|&c| c == 0).next().unwrap_or(&[]);
    let value: String = body.iter().map(|&c| char::from(c)).collect();
    field(
        format!("block {n} · {key}"),
        key,
        key,
        value,
        FieldKind::Text,
        true,
    )
}

fn find(fields: &[Field], key: &str) -> Option<usize> {
    fields.iter().position(|f| f.key == key)
}

fn sourced<T>(value: T, field: usize) -> Option<Sourced<T>> {
    Some(Sourced { value, field })
}

/// `YYYY-MM-DD` of `dd/mm/yyyy`, plus `Thh:mm:ss` and the zone of `hh:mm:ss.fff (GMT+h)` when they read well.
fn iso(date: &str, time: Option<&str>) -> Option<String> {
    let mut it = date.trim().split('/');
    let (d, m, y) = (it.next()?, it.next()?, it.next()?);
    if it.next().is_some() || y.len() != 4 {
        return None;
    }
    let (d, m, y): (u32, u32, u32) = (d.parse().ok()?, m.parse().ok()?, y.parse().ok()?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let day = format!("{y:04}-{m:02}-{d:02}");
    Some(match time.and_then(clock) {
        Some(t) => format!("{day}T{t}"),
        None => day,
    })
}

fn clock(t: &str) -> Option<String> {
    let (hms, rest) = t.trim().split_once(' ').unwrap_or((t.trim(), ""));
    let mut it = hms.split(':');
    let (h, m, s) = (it.next()?, it.next()?, it.next()?);
    let s = s.split('.').next()?;
    let (h, m, s): (u32, u32, u32) = (h.parse().ok()?, m.parse().ok()?, s.parse().ok()?);
    if h > 23 || m > 59 || s > 60 {
        return None;
    }
    let zone = rest
        .trim()
        .strip_prefix("(GMT")
        .and_then(|z| z.strip_suffix(')'))
        .and_then(|z| {
            let sign = z.chars().next().filter(|c| matches!(c, '+' | '-'))?;
            let hours: u32 = z.get(1..)?.parse().ok().filter(|h| *h <= 14)?;
            Some(format!("{sign}{hours:02}:00"))
        })
        .unwrap_or_default();
    Some(format!("{h:02}:{m:02}:{s:02}{zone}"))
}

/// Fills the standard values from the fields of the spectrum.
pub fn apply(s: &mut Spectrum) {
    let text = |s: &Spectrum, key: &str| {
        let i = find(&s.fields, key)?;
        let v = s.fields.get(i)?.value.trim().to_string();
        (!v.is_empty()).then_some((v, i))
    };
    let num = |s: &Spectrum, key: &str| {
        let i = find(&s.fields, key)?;
        let v: f64 = s.fields.get(i)?.value.parse().ok()?;
        v.is_finite().then_some((v, i))
    };
    if let Some((v, i)) = num(s, "ACQ.RES").filter(|(v, _)| *v > 0.0) {
        s.instrument.resolution_cm1 = sourced(v, i);
    }
    let scans = find(&s.fields, "ACQ.NSS").and_then(|i| {
        let n: u32 = s.fields.get(i)?.value.parse().ok()?;
        Some((n, i))
    });
    if let Some((n, i)) = scans {
        s.instrument.scans = sourced(n, i);
    }
    if let Some((v, i)) = text(s, "INST.INS") {
        s.instrument.model = sourced(v, i);
    }
    if let Some((v, i)) = text(s, "INST.SRN") {
        s.instrument.serial_number = sourced(v, i);
    }
    if let Some((v, i)) = text(s, "SMP.SNM") {
        s.measurement.title = sourced(v.clone(), i);
        s.measurement.sample_name = sourced(v, i);
    }
    if let Some((d, i)) = text(s, "DATA.DAT") {
        let time = text(s, "DATA.TIM").map(|(t, _)| t);
        if let Some(v) = iso(&d, time.as_deref()) {
            s.measurement.datetime = sourced(v, i);
        }
    }
    for f in &mut s.fields {
        match f.key.as_str() {
            "AB" | "SCSM" | "SCRF" | "IGSM" | "IGRF" => f.mapped = Some("y"),
            "DATA.NPT" | "DATA.FXV" | "DATA.LXV" => f.mapped = Some("x"),
            "DATA.DXU" => f.mapped = Some("x_unit"),
            _ => {}
        }
    }
}
