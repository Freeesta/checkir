//! Anonymous export: no value marked `identity` stays in the exported bytes; pseudonyms are stable and keyed.
use ftir_core::readers::anonymize::anonymize;
use ftir_core::readers::export::to_json;
use ftir_core::readers::model::{Document, Limits, Options};
use ftir_core::readers::{jcamp, text};

const JCAMP: &str = "##TITLE=Case 4711 powder\r\n##JCAMP-DX=4.24 $$ exported by C:\\Users\\mrossi\\Desktop\r\n##DATA TYPE=INFRARED SPECTRUM\r\n\
##ORIGIN=mrossi\r\n##OWNER=Servizio Alfa\r\n##SAMPLING PROCEDURE=white crystal sample-77\r\n##SAMPLE DESCRIPTION=Batch QX-12\r\n\
##LONG DATE=2018/05/09 14:22:11\r\n##DATE=5/9/2018\r\n##SPECTROMETER/DATA SYSTEM=IRSpirit SN A2145678\r\n##NOTES=seen by Dr Verdi\r\n\
##XUNITS=1/CM\r\n##YUNITS=ABSORBANCE\r\n##FIRSTX=4000\r\n##LASTX=3998\r\n##NPOINTS=3\r\n##XYDATA=(X++(Y..Y))\r\n4000 1 2 3\r\n##END=\r\n";

const TEXT: &str = "Operator: Giulia Neri\r\nSample: kitchen-table-9\r\nWavenumber (cm-1),Abs\r\n4000,0.1\r\n3990.5,0.2\r\n3981,0.3\r\n";

fn docs() -> Vec<Document> {
    let o = Options::default();
    vec![
        jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &o).expect("jcamp"),
        text::open(TEXT.as_bytes(), &Limits::STANDARD, &o).expect("text"),
    ]
}

fn identity_values(d: &Document) -> Vec<String> {
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
        .filter(|w| w.len() >= 3)
        .collect();
    v.sort();
    v.dedup();
    v
}

#[test]
fn no_identity_value_survives_the_anonymous_export() {
    for d in docs() {
        let before = to_json(&d);
        let secret = b"local secret";
        let anon = to_json(&anonymize(&d, secret));
        let values = identity_values(&d);
        assert!(!values.is_empty());
        for v in &values {
            assert!(before.contains(v.as_str()), "sanity: {v}");
            assert!(
                !anon.contains(v.as_str()),
                "identity value left in clear: {v}"
            );
        }
        assert!(!anon.contains("2018-05-09"), "only year and month are kept");
    }
}

#[test]
fn data_is_untouched_and_pseudonyms_are_stable() {
    for d in docs() {
        let a = anonymize(&d, b"secret one");
        assert_eq!(a, anonymize(&d, b"secret one"));
        assert_ne!(a, anonymize(&d, b"secret two"));
        assert_eq!(a.spectra[0].y, d.spectra[0].y);
        assert_eq!(a.spectra[0].x, d.spectra[0].x);
        assert_eq!(a.provenance, d.provenance);
        assert_eq!(a.fields.len(), d.fields.len());
    }
}

#[test]
fn standard_fields_follow_their_source_and_dates_lose_the_day() {
    let d = jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &Options::default()).expect("jcamp");
    let a = anonymize(&d, b"s");
    let s = &a.spectra[0];
    let title = s.measurement.title.as_ref().expect("title").value.clone();
    assert!(title.starts_with("title-"));
    assert_eq!(
        title,
        s.fields[s.measurement.title.as_ref().map_or(0, |t| t.field)].value
    );
    assert_eq!(
        s.measurement.datetime.as_ref().map(|v| v.value.as_str()),
        Some("2018-05")
    );
    let amb = s
        .warnings
        .iter()
        .find(|w| w.key == "reader.jcamp.date_ambiguous")
        .expect("warning");
    assert!(!amb.params.iter().any(|(_, v)| v.contains("5/9/2018")));
    // The original document keeps everything.
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
fn same_value_same_pseudonym_across_files() {
    let o = Options::default();
    let a = jcamp::open(JCAMP.as_bytes(), &Limits::STANDARD, &o).expect("a");
    let b = jcamp::open(
        JCAMP.replace("Case 4711", "Case 4712").as_bytes(),
        &Limits::STANDARD,
        &o,
    )
    .expect("b");
    let (a, b) = (anonymize(&a, b"k"), anonymize(&b, b"k"));
    let owner = |d: &Document| {
        d.spectra[0]
            .fields
            .iter()
            .find(|f| f.key == "OWNER")
            .map(|f| f.value.clone())
    };
    assert_eq!(owner(&a), owner(&b));
    let title = |d: &Document| {
        d.spectra[0]
            .measurement
            .title
            .as_ref()
            .map(|t| t.value.clone())
    };
    assert_ne!(title(&a), title(&b));
}
