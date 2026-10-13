//! Peak assignment on the real libraries of the private repository (bench `non_spiegati.py`): the active ingredient of one
//! library is the sample, the same compound from another instrument's library is the reference. Alone, the sample has no
//! unexplained peak; with 20 % of a cut added, the unexplained peaks fall on peaks of the cut. Skipped without `CHECKIR_DATA`.
mod common;
use ftir_core::assign::result::{ReferenceId, State};
use ftir_core::assign::rules::RuleSet;
use ftir_core::assign::{assign, assign_with, Context, PeakSet, Reference};
use ftir_core::confronti::{grid_absorbance, lettori::from_reader};
use ftir_core::peaks::{detect, Thresholds};
use ftir_core::readers::{self, model::Limits, model::Options};
use ftir_core::spectrum::Spectrum;
use std::path::Path;

const RESPONSE: &str = "Library/RESPONSE_ftir database_JDX/";
const BCCSU: &str = "Library/Copy of GCMS verified. Create a library from these files. BCCSU Library Files JCAMP/BCCSU Library JCAMP/";
const SWGDRUG: &str = "Library/SWGDRUG JCAMP 051524/";

/// (active, its file, the reference of another library, cut, the file of the cut)
type Case = (&'static str, String, String, &'static str, String);

fn swg(root: &Path, number: &str) -> String {
    let dir = root.join(SWGDRUG);
    let prefix = format!("{number} ");
    let found = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .find(|n| n.starts_with(&prefix))
        .unwrap_or_else(|| panic!("no SWGDRUG file {number}"));
    format!("{SWGDRUG}{found}")
}

fn cases(root: &Path) -> Vec<Case> {
    let r = |f: &str| format!("{RESPONSE}{f}");
    let b = |f: &str| format!("{BCCSU}{f}");
    let c = |name, a: &str, ra: &str, cut, fc: String| (name, r(a), swg(root, ra), cut, fc);
    vec![
        c(
            "cocaine HCl",
            "Cocaine HCl.DX",
            "#163",
            "lidocaine",
            swg(root, "#375"),
        ),
        c(
            "cocaine HCl",
            "Cocaine HCl.DX",
            "#163",
            "mannitol",
            b("Mannitol_0.dx"),
        ),
        c(
            "cocaine HCl",
            "Cocaine HCl.DX",
            "#163",
            "levamisole",
            swg(root, "#358"),
        ),
        c(
            "MDMA HCl",
            "MDMA HCl.DX",
            "#417",
            "caffeine",
            b("Caffeine_0.dx"),
        ),
        c(
            "heroin base",
            "Heroin.DX",
            "#202",
            "paracetamol",
            swg(root, "#354"),
        ),
        c(
            "ketamine HCl",
            "Ketamine HCl.DX",
            "#433",
            "lactose",
            b("Lactose_0.dx"),
        ),
    ]
}

fn open(root: &Path, file: &str) -> Spectrum {
    let bytes = std::fs::read(root.join(file)).unwrap_or_else(|e| panic!("{file}: {e}"));
    let head = &bytes[..bytes.len().min(4096)];
    let reader = readers::pick(file, head).unwrap_or_else(|| panic!("no reader for {file}"));
    let doc = (reader.open)(&bytes, &Limits::STANDARD, &Options::default())
        .unwrap_or_else(|e| panic!("{file}: {e:?}"));
    from_reader(&doc.spectra[doc.primary]).unwrap_or_else(|e| panic!("{file}: {}", e.error))
}

/// Absorbance on the common grid, scaled so that the highest point is 1 (the bench normalizes the same way).
fn normalized(root: &Path, file: &str) -> Spectrum {
    let mut g = grid_absorbance(&open(root, file)).unwrap_or_else(|| panic!("{file}: no grid"));
    let lo = g.y.iter().copied().fold(f64::INFINITY, f64::min);
    let hi = g.y.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    g.y.iter_mut().for_each(|v| *v = (*v - lo) / (hi - lo));
    g
}

fn mix(a: &Spectrum, cut: &Spectrum, share: f64) -> Spectrum {
    let mut m = a.clone();
    for (v, c) in m.y.iter_mut().zip(&cut.y) {
        *v = (1.0 - share) * *v + share * c;
    }
    m
}

fn peaks(s: &Spectrum, t: &Thresholds) -> PeakSet {
    PeakSet::from(&detect(s, t).expect("detect"))
}

fn reference(set: PeakSet) -> Reference {
    let id = ReferenceId {
        spectrum_id: None,
        substance_id: "active".into(),
        form: "form".into(),
        library: None,
        version: None,
    };
    Reference::new(id, set)
}

#[test]
fn the_active_alone_has_no_false_unexplained_peak_and_a_cut_shows_up_from_twenty_percent() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let t = Thresholds::embedded().expect("thresholds");
    for (name, file, ref_file, cut, cut_file) in cases(&root) {
        let (active, cut_s) = (normalized(&root, &file), normalized(&root, &cut_file));
        let refs = [reference(peaks(&normalized(&root, &ref_file), &t))];
        let alone = assign(&peaks(&active, &t), &refs, &t);
        assert_eq!(alone.summary.n_unexplained, Some(0), "{name}");
        let cut_peaks = peaks(&cut_s, &t);
        for share in [0.10, 0.20, 0.30] {
            let sample = peaks(&mix(&active, &cut_s, share), &t);
            let a = assign(&sample, &refs, &t);
            let on_cut = |id: &str| {
                let p = sample.peaks.iter().find(|p| p.id == id).expect("peak");
                cut_peaks
                    .peaks
                    .iter()
                    .any(|q| (q.position_cm1 - p.position_cm1).abs() <= 6.0)
            };
            let un: Vec<_> = a
                .items
                .iter()
                .filter(|i| i.state == State::Unexplained)
                .collect();
            let hit = un.iter().filter(|i| on_cut(&i.peak_id)).count();
            eprintln!(
                "{name} + {cut} {share:.2}: unexplained {} (on the cut {hit})",
                un.len()
            );
            if cut == "lidocaine" && share == 0.20 {
                assert!(
                    hit >= 3,
                    "{name} + {cut}: {hit} unexplained peaks on the cut"
                );
            }
        }
    }
}

#[test]
fn cocaine_hydrochloride_gets_the_ester_carbonyl_interpretation_near_1712() {
    let Some(root) = common::private_dir() else {
        eprintln!("skipped: CHECKIR_DATA not set");
        return;
    };
    let t = Thresholds::embedded().expect("thresholds");
    let (_, file, ref_file, _, _) = cases(&root).remove(0);
    let sample = peaks(&normalized(&root, &file), &t);
    let refs = [reference(peaks(&normalized(&root, &ref_file), &t))];
    let ctx = Context {
        rules: Some(RuleSet::embedded().expect("rules")),
        ..Context::empty()
    };
    let a = assign_with(&sample, &refs, &ctx, &t);
    let found: Vec<_> = sample
        .peaks
        .iter()
        .zip(&a.items)
        .filter(|(p, _)| (p.position_cm1 - 1712.0).abs() <= 6.0)
        .flat_map(|(_, i)| i.interpretations.iter().map(|r| r.group.clone()))
        .collect();
    eprintln!("cocaine HCl near 1712: {found:?}");
    assert!(found.iter().any(|g| g.starts_with("ester")), "{found:?}");
}
