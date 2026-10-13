//! Measurement quality on the real `.ispd` measurements of the private repository (`Spettri IR/`): skipped without
//! `CHECKIR_DATA`. It prints the counts of warnings per check and the median roughness used to calibrate the vapour
//! limit (`cargo test --release --test measurement_quality_real -- --nocapture`).
mod common;
use ftir_core::confronti::lettori::from_reader;
use ftir_core::measurement_quality::{check, Outcome, Thresholds};
use ftir_core::readers::ispd;
use ftir_core::readers::model::{Limits, Options};

#[test]
fn counts_on_the_real_measurements() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let mut files = Vec::new();
    common::walk(&root.join("Spettri IR"), &mut files);
    files.retain(|p| {
        p.extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("ispd"))
    });
    files.sort();
    let t = Thresholds::embedded().unwrap();
    let (mut done, mut warned) = (0usize, [0usize; 3]);
    let mut rough = Vec::new();
    let mut strong = 0;
    for p in &files {
        let bytes = std::fs::read(p).unwrap();
        let Ok(d) = ispd::open(&bytes, &Limits::STANDARD, &Options::default()) else {
            continue;
        };
        let Ok(s) = from_reader(&d.spectra[d.primary]) else {
            continue;
        };
        let Ok(r) = check(&s, &t) else { continue };
        done += 1;
        for (i, c) in r.checks.iter().enumerate() {
            warned[i] += usize::from(c.outcome == Outcome::Attention);
        }
        rough.extend(r.checks[1].measured);
        strong += usize::from(r.checks[2].severity == Some("strong"));
    }
    rough.sort_by(|a, b| a.total_cmp(b));
    let median = rough.get(rough.len() / 2).copied();
    eprintln!("files {} checked {done}: co2 {} vapour {} negative {} (strong {strong}); median vapour roughness {median:?}",
        files.len(), warned[0], warned[1], warned[2]);
    assert!(done > 200, "{done} spectra checked");
}
