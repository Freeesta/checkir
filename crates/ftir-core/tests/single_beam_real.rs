//! Single channels recomputed from the interferograms of the real `.ispd` measurements of the private repository
//! (`Spettri IR/`): skipped without `CHECKIR_DATA`. Compares the recomputed absorbance with the one the instrument
//! software saved (`cargo test --release --test single_beam_real -- --nocapture` prints the numbers).
mod common;
use ftir_core::readers::ispd;
use ftir_core::readers::model::{Limits, Options};
use ftir_core::single_beam::{correlation, recompute};

#[test]
fn recomputed_absorbance_follows_the_saved_one() {
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
    let (mut corr, mut skipped) = (Vec::new(), 0usize);
    for p in &files {
        let bytes = std::fs::read(p).unwrap();
        let Ok(d) = ispd::open(&bytes, &Limits::STANDARD, &Options::default()) else {
            continue;
        };
        let Ok(r) = recompute(&d) else {
            skipped += 1;
            continue;
        };
        let saved = &d.spectra[d.primary];
        let x = saved.x.values.to_vec();
        if let Some(c) = correlation(&x, &r.absorbance.y.values, &saved.y.values, 600.0, 3900.0) {
            corr.push(c);
        }
    }
    corr.sort_by(|a, b| a.total_cmp(b));
    let at = |q: f64| corr[((corr.len() - 1) as f64 * q) as usize];
    eprintln!(
        "files {} recomputed {} (not recomputable {skipped}): correlation min {:.5} p5 {:.5} median {:.5} max {:.5}; below 0.999: {}",
        files.len(), corr.len(), at(0.0), at(0.05), at(0.5), at(1.0),
        corr.iter().filter(|c| **c < 0.999).count()
    );
    let good = corr.iter().filter(|c| **c >= 0.999).count();
    assert!(good >= 50, "{good} files with correlation >= 0.999");
    assert!(
        good * 100 >= corr.len() * 95,
        "{good} of {} files",
        corr.len()
    );
    assert!(at(0.0) >= 0.99, "lowest correlation {}", at(0.0));
}
