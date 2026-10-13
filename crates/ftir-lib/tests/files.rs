//! `--from-files` of the builder and `files::from_files`: one private row per readable file, duplicates by SHA-256
//! dropped, unrecognised files counted apart, and the written package opens with the library's own checks.
use ftir_lib::data::Limits;
use ftir_lib::files::{from_files, slug};
use ftir_lib::package::Package;
use std::fs;
use std::process::Command;

/// A synthetic JCAMP-DX absorbance file with one Lorentz band at `centre` cm-1.
fn jcamp(centre: f64) -> Vec<u8> {
    let rows: Vec<(f64, f64)> = (0..400)
        .map(|k| {
            let x = 4000.0 - 4.0 * f64::from(k);
            (x, 1.0 / (1.0 + ((x - centre) / 20.0).powi(2)))
        })
        .collect();
    let mut s = format!("##TITLE=t\n##JCAMP-DX=4.24\n##DATA TYPE=INFRARED SPECTRUM\n##XUNITS=1/CM\n##YUNITS=ABSORBANCE\n##XFACTOR=1\n##YFACTOR=1\n##NPOINTS={}\n##XYPOINTS=(XY..XY)\n", rows.len());
    for (x, y) in rows {
        s.push_str(&format!("{x:.2}, {y:.6}\n"));
    }
    s.push_str("##END=\n");
    s.into_bytes()
}

fn named(name: &str, bytes: Vec<u8>) -> (String, Vec<u8>) {
    (name.to_string(), bytes)
}

#[test]
fn rows_follow_the_import_rules() {
    let got = from_files(&[
        named("Caffeine HCl.jdx", jcamp(1700.0)),
        named("copy of caffeine.jdx", jcamp(1700.0)),
        named("notes.txt", b"not a spectrum at all".to_vec()),
        named("Mannitol.dx", jcamp(1100.0)),
    ]);
    assert_eq!(got.rows.len(), 2);
    assert_eq!((got.repeated, got.unrecognized), (1, 1));
    let (row, values) = &got.rows[0];
    assert_eq!(
        (row.id.as_str(), row.name_en.as_str()),
        ("u1", "Caffeine HCl")
    );
    assert_eq!(row.substance.as_deref(), Some("caffeine-hcl"));
    assert_eq!(row.provenance_type, "user_import");
    assert_eq!(values.len(), 1576);
    assert_eq!(got.rows[1].0.id, "u2");
    assert!(!got.native.is_empty());
}

#[test]
fn slugs_are_ids() {
    assert_eq!(slug("Caffè  HCl (2)"), "caffe-hcl-2");
    assert_eq!(slug("---"), "library");
}

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_costruisci-libreria"))
        .args(args)
        .output()
        .expect("run builder")
}

#[test]
fn the_builder_writes_a_private_package_that_opens() {
    let tmp = std::env::temp_dir().join(format!("checkir-from-files-{}", std::process::id()));
    let (src, out) = (tmp.join("src"), tmp.join("out"));
    fs::create_dir_all(src.join("sub")).expect("dirs");
    fs::write(src.join("a.jdx"), jcamp(1700.0)).expect("a");
    fs::write(src.join("sub").join("b.jdx"), jcamp(1100.0)).expect("b");
    fs::write(src.join("sub").join("same.jdx"), jcamp(1100.0)).expect("same");
    fs::write(src.join("readme.md"), b"hello").expect("readme");
    let (s, o) = (src.to_str().expect("utf8"), out.to_str().expect("utf8"));

    let refused = run(&["--from-files", s, "--id", "mine", "--out", o]);
    assert!(
        !refused.status.success(),
        "without --private it must refuse"
    );
    let bad_id = run(&["--from-files", s, "--id", "Mine X", "--private", "--out", o]);
    assert!(!bad_id.status.success());

    let done = run(&[
        "--from-files",
        s,
        "--id",
        "mine",
        "--private",
        "--out",
        o,
        "--date",
        "2026-01-01",
    ]);
    assert!(
        done.status.success(),
        "{}",
        String::from_utf8_lossy(&done.stderr)
    );
    let dir = out.join("mine");
    let read = |f: &str| fs::read(dir.join(f)).expect(f);
    let manifest = String::from_utf8(read("manifest.json")).expect("utf8");
    let index = String::from_utf8(read("index.json")).expect("utf8");
    let pkg =
        Package::open(&manifest, &index, &read("data.bin"), &Limits::STANDARD).expect("opens");
    assert!(pkg.manifest.private);
    assert_eq!(
        (pkg.manifest.license.as_str(), pkg.manifest.name.as_str()),
        ("LicenseRef-private", "mine")
    );
    assert_eq!(pkg.index.len(), 2);
    assert!(!read("native.bin").is_empty());
    fs::remove_dir_all(&tmp).ok();
}
