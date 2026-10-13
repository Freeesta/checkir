//! Library comparison on the real libraries of the private repository: reproduces the oracle of bench 1
//! (`scratchpad/esperimenti/matematica/results/livelli_banco1.csv`). Skipped without `CHECKIR_DATA`.
mod common;
use ftir_core::confronti::cerca::search;
use ftir_core::confronti::indice::Index;
use ftir_core::confronti::lettori::from_reader;
use ftir_core::confronti::libreria::{LibEntry, LibraryCache};
use ftir_core::confronti::opzioni::parse_options;
use ftir_core::confronti::soglie::Thresholds;
use ftir_core::readers::{self, model::Limits, model::Options};
use ftir_core::spectrum::Spectrum;
use std::collections::HashMap;
use std::path::Path;

/// Rows of a CSV with quoted fields (`"a,b"`, `""` for a quote), header removed.
fn csv(path: &Path) -> Vec<Vec<String>> {
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

struct Row {
    file: String,
    lib: String,
    name: String,
    form: String,
    key: String,
}

fn load(root: &Path) -> (Vec<Row>, Vec<Spectrum>) {
    let dir = root.join("scratchpad/esperimenti/matematica");
    let rows: Vec<Row> = csv(&dir.join("identita_librerie.csv"))
        .into_iter()
        .map(|c| Row {
            file: c[0].clone(),
            lib: c[1].clone(),
            name: c[3].clone(),
            form: c[4].clone(),
            key: c[7].clone(),
        })
        .collect();
    let spectra = rows
        .iter()
        .map(|r| {
            let bytes =
                std::fs::read(root.join(&r.file)).unwrap_or_else(|e| panic!("{}: {e}", r.file));
            let head = &bytes[..bytes.len().min(4096)];
            let reader =
                readers::pick(&r.file, head).unwrap_or_else(|| panic!("no reader for {}", r.file));
            let doc = (reader.open)(&bytes, &Limits::STANDARD, &Options::default())
                .unwrap_or_else(|e| panic!("{}: {e:?}", r.file));
            from_reader(&doc.spectra[doc.primary])
                .unwrap_or_else(|e| panic!("{}: {}", r.file, e.error))
        })
        .collect();
    (rows, spectra)
}

#[test]
fn reproduces_the_levels_of_bench_1() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let (rows, spectra) = load(&root);
    let mut libs: Vec<LibraryCache> = ["SWG", "RSP", "BCC"]
        .iter()
        .map(|id| LibraryCache::new(id, "bench1"))
        .collect();
    for (r, s) in rows.iter().zip(&spectra) {
        let entry = LibEntry {
            id: r.file.clone(),
            substance: Some(r.key.clone()),
            display_name: r.name.clone(),
            form: r.form.clone(),
        };
        let lib = libs
            .iter_mut()
            .find(|l| l.id == r.lib)
            .unwrap_or_else(|| panic!("library {}", r.lib));
        lib.add(entry, s)
            .unwrap_or_else(|e| panic!("{}: {}", r.file, e.error));
    }
    let mut index = Index::new(libs);
    while index.twins_step(256).0 < index.total() {}
    let t = Thresholds::embedded().unwrap();
    let oracle: HashMap<String, Vec<String>> =
        csv(&root.join("scratchpad/esperimenti/matematica/results/livelli_banco1.csv"))
            .into_iter()
            .map(|c| (c[0].clone(), c))
            .collect();
    assert_eq!(oracle.len(), rows.len());
    let (mut worst_r1, mut worst_margin, mut other_top, mut level_diff) = (0.0f64, 0.0f64, 0, 0);
    for (r, s) in rows.iter().zip(&spectra) {
        let others: Vec<String> = ["SWG", "RSP", "BCC"]
            .iter()
            .filter(|l| **l != r.lib)
            .map(|l| format!("\"{l}\""))
            .collect();
        let opts = parse_options(&format!("{{\"libraries\":[{}]}}", others.join(",")), &t).unwrap();
        let out =
            search(&index, s, &opts, &t).unwrap_or_else(|e| panic!("{}: {}", r.file, e.error));
        let want = &oracle[&r.file];
        let top = &out.candidates[0];
        let (r1, margin) = (
            want[2].parse::<f64>().unwrap(),
            want[3].parse::<f64>().unwrap(),
        );
        worst_r1 = worst_r1.max((top.r_derivative - r1).abs());
        worst_margin = worst_margin.max((out.margin.unwrap() - margin).abs());
        other_top += usize::from(index.entry(top.g).id != want[1]);
        level_diff += usize::from(out.level.id() != want[4]);
        let twin = index.twin(top.g).is_some_and(|(v, _)| v >= t.twin_r);
        assert_eq!(
            u8::from(twin),
            want[5].parse::<u8>().unwrap(),
            "twin flag of {}",
            r.file
        );
    }
    eprintln!("worst |r1| {worst_r1:e}, worst |margin| {worst_margin:e}, different top {other_top}, different level {level_diff}");
    assert!(
        worst_r1 <= 1e-7 && worst_margin <= 1e-7,
        "r1 {worst_r1:e} margin {worst_margin:e}"
    );
    assert_eq!(level_diff, 0);
    assert_eq!(other_top, 0);
}
