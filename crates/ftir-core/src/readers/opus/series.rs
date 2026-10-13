//! Data series of a file (absorbance, single-channel and interferogram spectra) paired with their parameter blocks.
use super::data;
use super::directory::{Block, Class, Kind};
use super::meta;
use super::params::{self, Param};
use crate::readers::model::{Limits, ReadError, ReadResult, Severity, Spectrum, Warning};
use std::collections::BTreeSet;

/// A block with its class and bytes (`None` when the file ends inside it).
pub struct Item<'a> {
    pub b: Block,
    pub class: Class,
    pub chunk: Option<&'a [u8]>,
}

/// The order in which series are built and listed (absorbance first).
const ORDER: [Kind; 5] = [Kind::Ab, Kind::ScSm, Kind::ScRf, Kind::IgSm, Kind::IgRf];

fn first<'i, 'a>(items: &'i [Item<'a>], class: Class) -> Option<&'i Item<'a>> {
    items.iter().find(|i| i.class == class)
}

fn bad(why: &str) -> ReadError {
    ReadError::new("reader.opus.bad_data").with("why", why)
}

/// Builds one series: its data block and its parameter block must both be whole.
fn one(
    kind: Kind,
    d: &Item<'_>,
    items: &[Item<'_>],
    limits: &Limits,
    warnings: &mut Vec<Warning>,
) -> ReadResult<(Spectrum, Vec<Param>, usize)> {
    let chunk = d
        .chunk
        .ok_or_else(|| ReadError::new("reader.opus.truncated").with("what", "data"))?;
    let p = first(items, Class::DataParams(kind)).ok_or_else(|| bad("parameters"))?;
    let pchunk = p
        .chunk
        .ok_or_else(|| ReadError::new("reader.opus.truncated").with("what", "parameters"))?;
    let parsed = params::parse(pchunk, limits.max_fields);
    if parsed.broken {
        warnings.push(
            Warning::new("reader.opus.params_unreadable", Severity::Caution).with("object", p.b.n),
        );
    }
    let mut s = data::build(kind, chunk, &parsed.params, limits)?;
    s.fields = meta::param_fields("DATA", p.b.n, &parsed.params);
    s.fields.push(meta::bytes_field(kind.key(), d.b.n, chunk));
    Ok((s, parsed.params, p.b.n))
}

/// Every series that can be built, absorbance first. A failure of the absorbance, or of a limit, ends the reading; any
/// other series that fails is left out with a warning.
pub fn all(
    items: &[Item<'_>],
    limits: &Limits,
    warnings: &mut Vec<Warning>,
    used: &mut BTreeSet<usize>,
) -> ReadResult<Vec<(Kind, Spectrum)>> {
    let mut out = Vec::new();
    for kind in ORDER {
        let Some(d) = first(items, Class::Data(kind)) else {
            continue;
        };
        match one(kind, d, items, limits, warnings) {
            Ok((s, _, pn)) => {
                used.insert(d.b.n);
                used.insert(pn);
                out.push((kind, s));
            }
            Err(e) if kind == Kind::Ab || e.key == "reader.limit_exceeded" => return Err(e),
            Err(e) => warnings.push(
                Warning::new("reader.opus.block_skipped", Severity::Caution)
                    .with("object", d.b.n)
                    .with("reason", e.key),
            ),
        }
    }
    Ok(out)
}

/// The spectrum to show first: the absorbance of the file or, without it, the one computed from sample and background.
/// Returns the list of spectra with it in front.
pub fn with_primary(
    mut list: Vec<(Kind, Spectrum)>,
    warnings: &mut Vec<Warning>,
) -> ReadResult<Vec<Spectrum>> {
    let has = |k: Kind| list.iter().position(|(kind, _)| *kind == k);
    if has(Kind::Ab).is_none() {
        let (Some(a), Some(b)) = (has(Kind::ScSm), has(Kind::ScRf)) else {
            return Err(ReadError::new("reader.opus.no_spectrum"));
        };
        let (Some((_, sm)), Some((_, rf))) = (list.get(a), list.get(b)) else {
            return Err(ReadError::new("reader.opus.no_spectrum"));
        };
        let mut abs = data::absorbance(sm, rf)?;
        abs.fields = sm
            .fields
            .iter()
            .filter(|f| f.key.starts_with("DATA."))
            .cloned()
            .collect();
        abs.history.push(crate::readers::model::computed_entry(
            "absorbance_from_single_beam",
        ));
        warnings.push(Warning::new(
            "reader.opus.absorbance_computed",
            Severity::Info,
        ));
        list.insert(0, (Kind::Ab, abs));
    }
    Ok(list.into_iter().map(|(_, s)| s).collect())
}
