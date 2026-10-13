//! `.ispd` reader on the real files of the private repository: skipped without `CHECKIR_DATA`.
//!
//! The container is compared with `db_dump` through the fingerprints written by `tools/ispd_riferimento.py impronte`
//! (read from `CHECKIR_DATA/studio/formati/impronte_ispd.json`, or computed on the fly when `db_dump` is installed).
mod common;
use ftir_core::readers::anonymize::anonymize;
use ftir_core::readers::bdb;
use ftir_core::readers::export::to_json;
use ftir_core::readers::model::{Document, Limits, Options, Order, Role};
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
                let all = d
                    .fields
                    .iter()
                    .chain(d.spectra.iter().flat_map(|s| s.fields.iter()));
                let n = all.filter(|f| !f.origin.starts_with("decoded")).count();
                assert_eq!(n, pairs.len(), "{}", p.display());
                for w in d
                    .warnings
                    .iter()
                    .chain(d.spectra.iter().flat_map(|s| s.warnings.iter()))
                {
                    assert!(
                        !matches!(
                            w.key,
                            "reader.ispd.params_unreadable" | "reader.ispd.object_skipped"
                        ),
                        "{}: {}",
                        p.display(),
                        w.key
                    );
                }
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
        let flagged = |k: &str| sa.warnings.iter().any(|w| w.key == k);
        if dist(&xa, &xb, 1.0) <= 1e-9 && dist(&sa.y.values, &yb, 1.0) <= 1e-9 {
            assert!(
                !flagged("reader.ispd.y_scale") && !flagged("reader.ispd.x_range"),
                "{}",
                p.display()
            );
            identical += 1;
        } else {
            // Library files imported from a JCAMP with YFACTOR 1e-9 that the import did not apply: raw integers.
            assert!(dist(&sa.y.values, &yb, 1e9) <= 1e-3, "{}", p.display());
            assert!(
                flagged("reader.ispd.y_scale") && flagged("reader.ispd.x_range"),
                "{}",
                p.display()
            );
            raw_import += 1;
        }
    }
    let pairs = identical + raw_import;
    eprintln!(
        "library pairs: {pairs}, identical {identical}, raw import (y = 1e9 x JCAMP) {raw_import}"
    );
    assert!(identical >= 134);
}

fn open_all(folder: &str) -> Vec<(PathBuf, Document)> {
    let Some(root) = common::private_dir() else {
        return Vec::new();
    };
    ispd_files(&root.join(folder))
        .into_iter()
        .filter_map(|p| {
            let bytes = std::fs::read(&p).ok()?;
            let d = ispd::open(&bytes, &Limits::STANDARD, &Options::default()).ok()?;
            Some((p, d))
        })
        .collect()
}

#[test]
fn measurements_carry_parameters_history_and_interferograms() {
    let docs = open_all("Spettri IR");
    if docs.is_empty() {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    }
    assert!(docs.len() >= 239, "{}", docs.len());
    let (mut alerts, mut subtractions, mut coherent) = (0usize, 0usize, 0usize);
    for (p, d) in &docs {
        let m = &d.spectra[d.primary];
        let ins = &m.instrument;
        let name = p.display();
        assert!(
            ins.resolution_cm1.is_some() && ins.scans.is_some() && ins.model.is_some(),
            "{name}"
        );
        assert!(
            ins.serial_number.is_some() && ins.accessory.is_some() && !m.history.is_empty(),
            "{name}"
        );
        assert!(
            m.measurement.title.is_some() && m.measurement.datetime.is_some(),
            "{name}"
        );
        let roles: Vec<Role> = d.spectra.iter().map(|s| s.role).collect();
        assert!(roles.contains(&Role::SampleInterferogram), "{name}");
        assert!(roles.contains(&Role::BackgroundInterferogram), "{name}");
        subtractions += roles.iter().filter(|r| **r == Role::Subtraction).count();
        alerts += usize::from(
            d.warnings
                .iter()
                .any(|w| w.key == "reader.ispd.instrument_alert"),
        );
        let xs = m.x.values.to_vec();
        let step = (xs[xs.len() - 1] - xs[0]).abs() / (xs.len() - 1) as f64;
        let res = ins.resolution_cm1.as_ref().map_or(0.0, |r| r.value);
        coherent += usize::from(res > 0.0 && step < res);
    }
    eprintln!("{} measurements: {subtractions} subtractions, {alerts} with instrument alerts, step < resolution in {coherent}", docs.len());
}

/// Whole values that name a person, a machine or a sample (not words: the model name is not secret).
fn secrets(d: &Document) -> Vec<String> {
    let all = d
        .fields
        .iter()
        .chain(d.spectra.iter().flat_map(|s| s.fields.iter()));
    let mut v: Vec<String> = all
        .filter(|f| f.identity && f.kind != ftir_core::readers::model::FieldKind::Bytes)
        .map(|f| f.value.clone())
        .collect();
    for s in &d.spectra {
        let ins = &s.instrument;
        v.extend(
            ins.serial_number
                .iter()
                .chain(ins.accessory.iter())
                .map(|x| x.value.clone()),
        );
    }
    // Fixed names of the file format (object names such as the parameter list) also appear in keys: not secrets.
    let keys: Vec<&str> = d
        .fields
        .iter()
        .chain(d.spectra.iter().flat_map(|s| s.fields.iter()))
        .flat_map(|f| [f.key.as_str(), f.original_key.as_str()])
        .collect();
    v.retain(|x| x.len() >= 5 && !keys.iter().any(|k| k.contains(x.as_str())));
    v.sort();
    v.dedup();
    v
}

#[test]
fn anonymous_export_hides_every_identity_value_of_the_real_files() {
    let mut checked = 0usize;
    for folder in ["Spettri IR", "Data"] {
        for (p, d) in open_all(folder) {
            let json = to_json(&anonymize(&d, b"local secret"));
            for v in secrets(&d) {
                let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
                assert!(
                    !json.contains(&escaped) && !json.contains(&v),
                    "{}: {v}",
                    p.display()
                );
            }
            checked += 1;
        }
    }
    eprintln!("anonymous export checked on {checked} files");
}
