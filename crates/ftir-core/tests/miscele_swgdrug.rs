//! The 60/40 caffeine/paracetamol sample of the browser scenario (`tests_e2e/scenari/300-swgdrugSamples.mjs`) against the 11 public
//! SWGDRUG spectra: the proposal holds with both components even though lactose joins as a minor cut.
use ftir_core::miscele::dati::{Cuts, Thresholds};
use ftir_core::miscele::{analyze, Candidate, Verdict};
use ftir_core::peaks;
use ftir_core::readers::jcamp;
use ftir_core::readers::model::{Limits, Options};
use ftir_core::spectrum::{Role, Spectrum, YUnit};
use std::path::PathBuf;

const PURES: [(&str, &str); 11] = [
    ("caffeine", "caffeine-base.swgdrug.357"),
    ("paracetamol", "paracetamol-neutral.swgdrug.354"),
    ("phenacetin", "phenacetin-neutral.swgdrug.352"),
    ("levamisole", "levamisole-hcl.swgdrug.358"),
    ("procaine", "procaine-hcl.swgdrug.374"),
    ("benzocaine", "benzocaine-base.swgdrug.350"),
    ("lidocaine", "lidocaine-base.swgdrug.508"),
    ("lidocaine", "lidocaine-hcl-h2o.swgdrug.375"),
    ("lactose", "lactose-alpha.swgdrug.388"),
    ("mannitol", "mannitol-neutral.swgdrug.366"),
    ("inositol", "inositol-neutral.swgdrug.367"),
];

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn candidate(substance: &str, id: &str) -> Candidate {
    let path = root().join(format!("data/substances/{substance}/spectra/{id}.jdx"));
    let bytes = std::fs::read(&path).expect("public spectrum");
    let doc = jcamp::open(&bytes, &Limits::STANDARD, &Options::default()).expect("jcamp");
    let s = &doc.spectra[0];
    Candidate {
        id: id.to_string(),
        substance: Some(substance.to_string()),
        name: substance.to_string(),
        library: "swgdrug-ir".to_string(),
        spectrum: Spectrum::new(
            Role::Reference,
            YUnit::Absorbance,
            s.x.values.to_vec(),
            s.y.values.clone(),
        ),
    }
}

fn sample() -> Spectrum {
    let path =
        root().join("crates/ftir-core/tests/fixtures/miscele/mix_60_40_caffeine_paracetamol.csv");
    let text = std::fs::read_to_string(path).expect("fixture");
    let (x, y): (Vec<f64>, Vec<f64>) = text
        .lines()
        .skip(1)
        .map(|l| {
            let (a, b) = l.split_once(',').expect("two columns");
            (a.parse::<f64>().expect("x"), b.parse::<f64>().expect("y"))
        })
        .unzip();
    Spectrum::new(Role::Sample, YUnit::Absorbance, x, y)
}

#[test]
fn the_sixty_forty_sample_is_proposed_with_both_components_and_a_minor_cut_does_not_reject_it() {
    let pool: Vec<Candidate> = PURES.iter().map(|(s, id)| candidate(s, id)).collect();
    let m = analyze(
        &sample(),
        &pool,
        &Thresholds::embedded().expect("thresholds"),
        &Cuts::embedded().expect("cuts"),
        &peaks::Thresholds::embedded().expect("peaks"),
    )
    .expect("analysis");
    let ids = |minor: bool| -> Vec<&str> {
        m.components
            .iter()
            .filter(|c| c.minor == minor)
            .map(|c| c.substance.as_deref().unwrap_or(""))
            .collect()
    };
    for want in ["caffeine", "paracetamol"] {
        assert!(ids(false).contains(&want), "{:?}", m.components);
    }
    // A minor component explains the peaks the others left: that is the count the gate reads.
    assert!(
        m.components
            .iter()
            .filter(|c| c.minor)
            .all(|c| c.explained_peaks >= 1),
        "{:?}",
        m.components
    );
    assert_eq!(
        m.proposal.verdict,
        Verdict::Proposed,
        "{:?} {:?}",
        m.proposal,
        ids(true)
    );
}
