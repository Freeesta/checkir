//! Cleaning contract `anonimizza/1`: every reader of the registry has a table, every field a reader declares or produces has
//! an action (T4), nothing identifying survives `clean`, and the contract document matches its committed copy.
use ftir_core::anonimizza::{action_for, clean, contract_json, listed_action, Action, CONTRACT};
use ftir_core::readers::export::to_json;
use ftir_core::readers::model::{Document, Limits, Options};
use ftir_core::readers::{ispd, jcamp, opus, pick, spa, spc, text, READERS};
use std::path::PathBuf;

const JCAMP: &str = "##TITLE=Case 4711 powder\r\n##JCAMP-DX=4.24 $$ exported by C:\\Users\\mrossi\\Desktop\r\n##DATA TYPE=INFRARED SPECTRUM\r\n\
##ORIGIN=mrossi\r\n##OWNER=Servizio Alfa\r\n##SAMPLING PROCEDURE=white crystal sample-77\r\n##SAMPLE DESCRIPTION=Batch QX-12\r\n\
##LONG DATE=2018/05/09 14:22:11\r\n##DATE=5/9/2018\r\n##SPECTROMETER/DATA SYSTEM=IRSpirit SN A2145678\r\n##NOTES=seen by Dr Verdi\r\n\
##XUNITS=1/CM\r\n##YUNITS=ABSORBANCE\r\n##FIRSTX=4000\r\n##LASTX=3998\r\n##NPOINTS=3\r\n##XYDATA=(X++(Y..Y))\r\n4000 1 2 3\r\n##END=\r\n";

const TEXT: &str = "Operator: Giulia Neri\r\nSample: kitchen-table-9\r\nWavenumber (cm-1),Abs\r\n4000,0.1\r\n3990.5,0.2\r\n3981,0.3\r\n";

fn opus_bytes() -> Vec<u8> {
    use ftir_core::synthetic::Params;
    use ftir_core::synthetic_opus::{write, Spec};
    write(&Spec::from_params(&Params::demo()))
}

fn fixture_dir(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// Every synthetic document the readers can open: the two inline files and all committed fixtures.
fn documents() -> Vec<Document> {
    let o = Options::default();
    let mut docs = vec![
        jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &o).expect("jcamp"),
        text::open(TEXT.as_bytes(), &Limits::STANDARD, &o).expect("text"),
        opus::open(&opus_bytes(), &Limits::STANDARD, &o).expect("opus"),
    ];
    for dir in ["jcamp", "ispd", "spa", "spc"] {
        let mut names: Vec<_> = std::fs::read_dir(fixture_dir(dir))
            .expect("fixture folder")
            .map(|e| e.expect("entry").path())
            .filter(|p| {
                p.extension()
                    .is_some_and(|x| x == "jdx" || x == "ispd" || x == "spa" || x == "spc")
            })
            .collect();
        names.sort();
        for p in names {
            let bytes = std::fs::read(&p).expect("read");
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if let Some(r) = pick(name, &bytes) {
                if let Ok(d) = (r.open)(&bytes, &Limits::STANDARD, &o) {
                    docs.push(d);
                }
            }
        }
    }
    docs
}

/// The keys a reader declares as its own. A reader without an entry here fails the test: add its fields and its table.
fn declared(reader: &str) -> Vec<String> {
    let strs = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match reader {
        "jcamp-dx" => strs(jcamp::meta::KNOWN),
        "text-xy" => strs(text::KNOWN_KEYS.as_slice()),
        "shimadzu-ispd" => {
            let mut v = strs(ispd::KNOWN);
            v.extend(strs(&[
                "NAME",
                "CREATED",
                "HISTORY",
                "HISTORY_AUTHOR",
                "HISTORY_DATE",
            ]));
            v.extend(ispd::KNOWN_IDS.iter().map(|id| format!("param.{id}")));
            v
        }
        "bruker-opus" => strs(opus::KNOWN),
        "thermo-spa" => strs(spa::KNOWN),
        "galactic-spc" => strs(spc::KNOWN),
        other => panic!(
            "reader {other}: declare its fields in this test and write its table in the contract"
        ),
    }
}

/// Keys without an explicit action.
fn missing(reader: &str, keys: &[String]) -> Vec<String> {
    keys.iter()
        .filter(|k| listed_action(reader, k).is_none())
        .cloned()
        .collect()
}

#[test]
fn every_reader_has_a_table_and_no_table_is_stale() {
    for r in READERS {
        assert!(
            CONTRACT.iter().any(|t| t.reader == r.id),
            "no table for reader {}",
            r.id
        );
    }
    for t in CONTRACT {
        assert!(
            READERS.iter().any(|r| r.id == t.reader),
            "stale table {}",
            t.reader
        );
    }
}

#[test]
fn every_declared_field_has_an_action() {
    for r in READERS {
        let keys = declared(r.id);
        assert!(
            missing(r.id, &keys).is_empty(),
            "{}: {:?}",
            r.id,
            missing(r.id, &keys)
        );
    }
}

#[test]
fn a_field_missing_from_the_table_is_caught() {
    let keys = vec!["OWNER".to_string(), "NEW_SERIAL_FIELD".to_string()];
    assert_eq!(
        missing("jcamp-dx", &keys),
        vec!["NEW_SERIAL_FIELD".to_string()]
    );
}

#[test]
fn every_known_field_produced_has_an_action_and_no_identity_is_kept() {
    for d in documents() {
        let reader = d.provenance.reader;
        for f in d
            .fields
            .iter()
            .chain(d.spectra.iter().flat_map(|s| s.fields.iter()))
        {
            // The header line that names the columns is free text: the table has no key for it.
            if f.known && f.mapped != Some("column.names") {
                assert!(
                    listed_action(reader, &f.key).is_some(),
                    "{reader}: {} has no action",
                    f.key
                );
            }
            if f.identity {
                assert_ne!(
                    action_for(reader, &f.key),
                    Action::Keep,
                    "{reader}: {} is identity but kept",
                    f.key
                );
            }
        }
    }
}

fn identity_words(d: &Document) -> Vec<String> {
    let mut v: Vec<String> = d
        .fields
        .iter()
        .chain(d.spectra.iter().flat_map(|s| s.fields.iter()))
        .filter(|f| f.identity)
        .flat_map(|f| {
            f.value
                .split(['\n', ' ', '\\'])
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|w| w.len() >= 5)
        .collect();
    v.sort();
    v.dedup();
    v
}

#[test]
fn no_identity_value_survives_the_cleaning() {
    for d in documents() {
        let (cleaned, report) = clean(&d);
        let before = to_json(&d);
        let after = to_json(&cleaned);
        // Words of the JSON structure itself (key names, units) are not identifying.
        let mut bare = d.clone();
        bare.provenance.reader = "fake-reader";
        let skeleton = to_json(&clean(&bare).0);
        let words: Vec<String> = identity_words(&d)
            .into_iter()
            .filter(|w| !skeleton.contains(w.as_str()))
            .collect();
        for w in &words {
            assert!(before.contains(w.as_str()), "sanity: {w}");
            // A word can also be a kept physical value (e.g. a unit): then it is not identifying.
            let kept_elsewhere = cleaned
                .spectra
                .iter()
                .any(|s| s.fields.iter().any(|f| f.value.contains(w.as_str())))
                || cleaned.fields.iter().any(|f| f.value.contains(w.as_str()));
            if !kept_elsewhere && after.contains(w.as_str()) {
                let at = after.find(w.as_str()).unwrap_or(0);
                let from = at.saturating_sub(80);
                panic!(
                    "{}: identity word left: {w} in {}",
                    d.provenance.reader,
                    &after[from..(at + 40).min(after.len())]
                );
            }
        }
        let shown = format!("{report:?}");
        // The scopes and key names of the report are its own vocabulary, not values.
        let vocabulary = format!("{:?}", clean(&bare).1);
        let leaked: Vec<_> = words
            .iter()
            .filter(|w| shown.contains(w.as_str()) && !vocabulary.contains(w.as_str()))
            .collect();
        assert!(
            leaked.is_empty(),
            "the report carries a value: {leaked:?} in {shown}"
        );
    }
}

#[test]
fn dates_lose_the_day_and_standard_values_follow_their_fields() {
    let d = jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &Options::default()).expect("jcamp");
    let (c, report) = clean(&d);
    let s = &c.spectra[0];
    assert!(s.measurement.title.is_none() && s.measurement.sample_name.is_none());
    assert_eq!(
        s.measurement.datetime.as_ref().map(|v| v.value.as_str()),
        Some("2018-05")
    );
    let at = s
        .measurement
        .datetime
        .as_ref()
        .map_or(usize::MAX, |v| v.field);
    assert_eq!(s.fields.get(at).map(|f| f.value.as_str()), Some("2018-05"));
    assert!(!to_json(&c).contains("2018-05-09") && !to_json(&c).contains("5/9/2018"));
    let owner = report
        .changes
        .iter()
        .find(|x| x.key == "OWNER")
        .expect("OWNER in the report");
    assert_eq!((owner.action, owner.count), (Action::Strip, 1));
    assert!(report
        .changes
        .iter()
        .any(|x| x.key == "LONGDATE" && x.action == Action::Coarsen));
    assert!(report.kept > 0);
    // The original keeps everything.
    assert_eq!(
        d.spectra[0]
            .measurement
            .title
            .as_ref()
            .map(|t| t.value.as_str()),
        Some("Case 4711 powder")
    );
}

#[test]
fn data_units_and_provenance_are_untouched() {
    for d in documents() {
        let (c, _) = clean(&d);
        assert_eq!(c.provenance, d.provenance);
        assert_eq!(c.spectra.len(), d.spectra.len());
        for (a, b) in c.spectra.iter().zip(&d.spectra) {
            assert_eq!((&a.x, &a.y, a.role), (&b.x, &b.y, b.role));
            assert_eq!(
                a.instrument.resolution_cm1.as_ref().map(|v| v.value),
                b.instrument.resolution_cm1.as_ref().map(|v| v.value)
            );
            assert!(a.history.is_empty() && a.instrument.serial_number.is_none());
        }
    }
}

#[test]
fn unknown_fields_and_readers_are_stripped() {
    let mut d =
        jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &Options::default()).expect("jcamp");
    d.provenance.reader = "fake-reader";
    let (c, report) = clean(&d);
    assert!(c.fields.is_empty() && c.spectra.iter().all(|s| s.fields.is_empty()));
    assert_eq!(report.kept, 0);
    assert!(report
        .changes
        .iter()
        .all(|x| x.key == "(unknown field)" || x.key == "history" || x.key.starts_with("warning")));
}

#[test]
fn the_contract_document_matches_its_committed_copy() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixture/schemi/anonimizza/valid/contratto.json");
    let committed = std::fs::read_to_string(&path).expect("committed contract");
    assert!(
        committed == contract_json(),
        "run: cargo run --release -p ftir-core --example gen_anonimizza"
    );
}
