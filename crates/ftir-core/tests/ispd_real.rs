//! `.ispd` reader on the real files of the private repository: skipped without `CHECKIR_DATA`.
//!
//! The container is compared with `db_dump` through the fingerprints written by `tools/ispd_riferimento.py impronte`
//! (read from `CHECKIR_DATA/studio/formati/impronte_ispd.json`, or computed on the fly when `db_dump` is installed).
mod common;
use ftir_core::readers::bdb;
use ftir_core::readers::model::{Limits, Options, Order};
use ftir_core::readers::{ispd, jcamp};
use ftir_core::synthetic_ispd::container_digest;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

fn ispd_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    common::walk(root, &mut files);
    files.retain(|p| {
        p.extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("ispd"))
    });
    files.sort();
    files
}

/// `(pairs, digest)` per relative path, from the reference tool.
fn reference(root: &Path) -> Option<BTreeMap<String, (usize, String)>> {
    let stored = root.join("studio/formati/impronte_ispd.json");
    let path = if stored.exists() {
        stored
    } else {
        let out = std::env::temp_dir().join("checkir_impronte_ispd.json");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tools/ispd_riferimento.py");
        let ok = std::process::Command::new("python3")
            .arg(script)
            .arg("impronte")
            .arg(root)
            .arg(&out)
            .output()
            .is_ok_and(|o| o.status.success());
        if !ok {
            return None;
        }
        out
    };
    let text = std::fs::read_to_string(path).ok()?;
    let mut map = BTreeMap::new();
    // Minimal parser for {"path": {"digest": "...", "pairs": N}, ...} written by the script.
    let mut rest = text.as_str();
    while let Some(i) = rest.find("\"digest\": \"") {
        let before = &rest[..i];
        let name_end = before.rfind("\": {")?;
        let name_start = before[..name_end].rfind('"')? + 1;
        let name = before[name_start..name_end].replace("\\\\", "\\");
        let after = &rest[i + 11..];
        let digest = after[..after.find('"')?].to_string();
        let pairs_at = after.find("\"pairs\": ")? + 9;
        let tail = &after[pairs_at..];
        let n: usize = tail[..tail.find(|c: char| !c.is_ascii_digit())?]
            .parse()
            .ok()?;
        map.insert(name, (n, digest));
        rest = &after[pairs_at..];
    }
    Some(map)
}

#[test]
fn container_matches_db_dump_on_every_file() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let files = ispd_files(&root);
    assert!(files.len() >= 600, "{} files", files.len());
    let Some(reference) = reference(&root) else {
        eprintln!("skipped: no fingerprints and no db_dump");
        return;
    };
    let (mut same, mut unsupported) = (0usize, 0usize);
    for p in &files {
        let rel = p
            .strip_prefix(&root)
            .unwrap_or(p)
            .to_string_lossy()
            .into_owned();
        let bytes = std::fs::read(p).expect("read");
        match bdb::read_hash(&bytes, &Limits::STANDARD) {
            Ok(pairs) => {
                let list: Vec<_> = pairs.into_iter().map(|x| (x.key, x.value)).collect();
                let want = reference
                    .get(&rel)
                    .unwrap_or_else(|| panic!("no reference for {rel}"));
                assert_eq!(&container_digest(&list), want, "{rel}");
                same += 1;
            }
            Err(e) => {
                assert!(e.key.starts_with("reader.ispd.bdb_"), "{rel}: {}", e.key);
                unsupported += 1;
            }
        }
    }
    eprintln!(
        "container identical to db_dump: {same}/{} ({unsupported} other Berkeley DB versions)",
        files.len()
    );
    assert!(same + unsupported == files.len() && unsupported <= 2);
}

#[test]
fn every_measurement_opens_and_keeps_every_pair() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let mut kinds: BTreeMap<String, usize> = BTreeMap::new();
    for p in ispd_files(&root) {
        let bytes = std::fs::read(&p).expect("read");
        let Ok(pairs) = bdb::read_hash(&bytes, &Limits::STANDARD) else {
            continue;
        };
        match ispd::open(&bytes, &Limits::STANDARD, &Options::default()) {
            Ok(d) => {
                let n = d.fields.len() + d.spectra.iter().map(|s| s.fields.len()).sum::<usize>();
                assert_eq!(n, pairs.len(), "{}", p.display());
                *kinds.entry("ok".into()).or_default() += 1;
                if d.spectra[0].measurement.title.is_none() {
                    *kinds.entry("no name".into()).or_default() += 1;
                }
                for w in &d.warnings {
                    *kinds.entry(format!("warning {}", w.key)).or_default() += 1;
                }
            }
            Err(e) => *kinds.entry(format!("error {}", e.key)).or_default() += 1,
        }
    }
    eprintln!("{kinds:?}");
    assert!(kinds.get("ok").copied().unwrap_or(0) >= 680);
    assert!(kinds.keys().all(|k| !k.starts_with("error")), "{kinds:?}");
}

#[test]
fn library_pairs_agree_with_the_jcamp_exports() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let (mut identical, mut raw_import) = (0usize, 0usize);
    for p in ispd_files(&root.join("Library")) {
        let Some(dx) = ["DX", "dx"]
            .iter()
            .map(|e| p.with_extension(e))
            .find(|d| d.exists())
        else {
            continue;
        };
        let a = ispd::open(
            &std::fs::read(&p).expect("read"),
            &Limits::STANDARD,
            &Options::default(),
        )
        .expect("ispd");
        let b = jcamp::open(
            &std::fs::read(&dx).expect("read"),
            &Limits::STANDARD,
            &Options::default(),
        )
        .expect("jcamp");
        let (sa, sb) = (&a.spectra[a.primary], &b.spectra[b.primary]);
        let (mut xb, mut yb) = (sb.x.values.to_vec(), sb.y.values.clone());
        if sb.x.order == Order::Descending {
            yb.reverse();
            xb.reverse();
        }
        let xa = sa.x.values.to_vec();
        assert_eq!(xa.len(), xb.len(), "{}", p.display());
        let dist = |u: &[f64], v: &[f64], k: f64| {
            u.iter()
                .zip(v)
                .map(|(a, b)| (a - k * b).abs())
                .fold(0.0, f64::max)
        };
        if dist(&xa, &xb, 1.0) <= 1e-9 && dist(&sa.y.values, &yb, 1.0) <= 1e-9 {
            identical += 1;
        } else {
            // Library files imported from a JCAMP with YFACTOR 1e-9 that the import did not apply: raw integers.
            assert!(dist(&sa.y.values, &yb, 1e9) <= 1e-3, "{}", p.display());
            raw_import += 1;
        }
    }
    let pairs = identical + raw_import;
    eprintln!(
        "library pairs: {pairs}, identical {identical}, raw import (y = 1e9 x JCAMP) {raw_import}"
    );
    assert!(identical >= 134);
}
