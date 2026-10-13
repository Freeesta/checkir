//! The reader against the real BCCSU library of the private repository (`Library/BCCSU.L01` + `.nam`) and its JCAMP twins:
//! skipped without `CHECKIR_DATA`. Each entry must correlate with the JCAMP of the same name (the library keeps 8 bits).
mod common;
use ftir_core::readers::jcamp;
use ftir_core::readers::model::{Limits, Options, Spectrum};
use ftir_core::readers::shimadzu_lib::open_named;

/// Linear interpolation of `s` (ascending or descending x) at `x`, `None` outside its range.
fn at(xs: &[f64], ys: &[f64], x: f64) -> Option<f64> {
    let (lo, hi) = (xs.first()?.min(*xs.last()?), xs.first()?.max(*xs.last()?));
    if x < lo || x > hi {
        return None;
    }
    let i = xs.windows(2).position(|w| (w[0] - x) * (w[1] - x) <= 0.0)?;
    let (x0, x1, y0, y1) = (xs[i], xs[i + 1], ys[i], ys[i + 1]);
    Some(if x1 == x0 {
        y0
    } else {
        y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    })
}

fn pearson(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len() as f64;
    let (ma, mb) = (a.iter().sum::<f64>() / n, b.iter().sum::<f64>() / n);
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for (x, y) in a.iter().zip(b) {
        sab += (x - ma) * (y - mb);
        saa += (x - ma).powi(2);
        sbb += (y - mb).powi(2);
    }
    sab / (saa * sbb).sqrt()
}

fn twin(s: &Spectrum, lib: &Spectrum) -> Option<f64> {
    let xs = s.x.values.to_vec();
    let grid = lib.x.values.to_vec();
    let (mut a, mut b) = (Vec::new(), Vec::new());
    for (g, v) in grid.iter().zip(&lib.y.values) {
        if let Some(y) = at(&xs, &s.y.values, *g) {
            a.push(y);
            b.push(*v);
        }
    }
    (a.len() > 500).then(|| pearson(&a, &b))
}

#[test]
fn bccsu_entries_match_their_jcamp_twins() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let dir = root.join("Library");
    let jdx = dir.join("Copy of GCMS verified. Create a library from these files. BCCSU Library Files JCAMP/BCCSU Library JCAMP");
    let l01 = std::fs::read(dir.join("BCCSU.L01")).unwrap();
    let nam = std::fs::read(dir.join("BCCSU.nam")).unwrap();
    let doc = open_named(&l01, Some(&nam), &Limits::STANDARD).unwrap();
    assert_eq!(doc.spectra.len(), 66);
    let mut twins = Vec::new();
    for e in std::fs::read_dir(&jdx).unwrap().flatten() {
        let bytes = std::fs::read(e.path()).unwrap();
        if let Ok(d) = jcamp::open(&bytes, &Limits::STANDARD, &Options::default()) {
            twins.extend(d.spectra.get(d.primary).cloned());
        }
    }
    assert!(twins.len() >= 60, "twins read: {}", twins.len());
    // Names differ between the library and the file names, so every entry looks for its best twin by shape.
    let mut good = 0;
    for s in &doc.spectra {
        let best = twins
            .iter()
            .filter_map(|t| twin(t, s))
            .fold(0.0f64, |m, r| m.max(r.abs()));
        eprintln!(
            "{}: best r = {best:.4}",
            s.measurement.title.as_ref().expect("name").value
        );
        good += usize::from(best > 0.99);
    }
    assert_eq!(good, doc.spectra.len());
}
