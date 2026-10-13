//! Peak detection on the real libraries of the private repository: the strong peaks of one file are found again in the
//! file of the same compound and form from another library, within ±6 cm⁻¹. Skipped without `CHECKIR_DATA`.
mod common;
use ftir_core::confronti::lettori::from_reader;
use ftir_core::peaks::result::Kind;
use ftir_core::peaks::{detect, Thresholds};
use ftir_core::readers::{self, model::Limits, model::Options};
use ftir_core::spectrum::Spectrum;
use std::collections::BTreeMap;
use std::path::Path;

/// Rows of the identity table (`file, library, …, form, …, key`) without the header; fields may be quoted.
fn rows(path: &Path) -> Vec<Vec<String>> {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    text.lines().skip(1).map(split_line).collect()
}

fn split_line(line: &str) -> Vec<String> {
    let (mut out, mut cur, mut quoted) = (Vec::new(), String::new(), false);
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            ('"', _) => quoted = !quoted,
            (',', false) => out.push(std::mem::take(&mut cur)),
            (c, _) => cur.push(c),
        }
    }
    out.push(cur);
    out
}

fn open(root: &Path, file: &str) -> Spectrum {
    let bytes = std::fs::read(root.join(file)).unwrap_or_else(|e| panic!("{file}: {e}"));
    let head = &bytes[..bytes.len().min(4096)];
    let reader = readers::pick(file, head).unwrap_or_else(|| panic!("no reader for {file}"));
    let doc = (reader.open)(&bytes, &Limits::STANDARD, &Options::default())
        .unwrap_or_else(|e| panic!("{file}: {e:?}"));
    from_reader(&doc.spectra[doc.primary]).unwrap_or_else(|e| panic!("{file}: {}", e.error))
}

/// Groups of files of the same compound and form: the first file (in library order) and the files of the other libraries.
fn groups(root: &Path) -> Vec<(String, Vec<String>)> {
    let table = rows(&root.join("scratchpad/esperimenti/matematica/identita_librerie.csv"));
    let mut by_key: BTreeMap<(String, String), Vec<(String, String)>> = BTreeMap::new();
    for r in &table {
        let (file, lib, form, key) = (&r[0], &r[1], &r[4], &r[7]);
        if !key.is_empty() {
            by_key
                .entry((key.clone(), form.clone()))
                .or_default()
                .push((lib.clone(), file.clone()));
        }
    }
    by_key
        .into_values()
        .filter_map(|mut g| {
            g.sort();
            let first = g.first()?.clone();
            let others: Vec<String> = g
                .iter()
                .filter(|(lib, _)| *lib != first.0)
                .map(|(_, f)| f.clone())
                .collect();
            (!others.is_empty()).then_some((first.1, others))
        })
        .collect()
}

fn positions(root: &Path, file: &str, t: &Thresholds) -> Option<Vec<f64>> {
    let r = detect(&open(root, file), t).ok()?;
    Some(r.peaks.iter().map(|p| p.position_cm1).collect())
}

#[test]
fn strong_peaks_of_the_same_compound_are_found_again_in_another_library() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let t = Thresholds::embedded().expect("thresholds");
    let list = groups(&root);
    assert!(list.len() > 50, "only {} groups", list.len());
    let (mut strong, mut in_any, mut in_pair, mut counts) = (0usize, 0usize, 0usize, Vec::new());
    for (a, others) in &list {
        let (Ok(first), Some(rest)) = (
            detect(&open(&root, a), &t),
            others
                .iter()
                .map(|f| positions(&root, f, &t))
                .collect::<Option<Vec<_>>>(),
        ) else {
            continue;
        };
        counts.push((first.peaks.len(), first.broad_bands.len()));
        let near = |list: &Vec<f64>, at: f64| list.iter().any(|q| (q - at).abs() <= 6.0);
        for p in first
            .peaks
            .iter()
            .filter(|p| p.kind == Kind::Peak && p.artifact.is_none() && p.prominence_rel >= 0.10)
        {
            strong += 1;
            in_any += usize::from(rest.iter().any(|l| near(l, p.position_cm1)));
            in_pair += usize::from(near(&rest[0], p.position_cm1));
        }
    }
    counts.sort();
    eprintln!(
        "{} groups, {strong} strong peaks: {:.1} % found in some other library, {:.1} % in the first other one; peaks and broad bands per spectrum: min {:?} median {:?} max {:?}",
        list.len(), 100.0 * in_any as f64 / strong as f64, 100.0 * in_pair as f64 / strong as f64, counts[0], counts[counts.len() / 2], counts[counts.len() - 1]
    );
    assert!(
        in_any as f64 >= 0.95 * strong as f64,
        "{in_any} of {strong}"
    );
    assert!(
        in_pair as f64 >= 0.90 * strong as f64,
        "{in_pair} of {strong}"
    );
}
