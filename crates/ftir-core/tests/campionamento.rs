//! The sampling method a file names (JCAMP `##SAMPLING PROCEDURE`) and the ids of the closed list.
use ftir_core::readers::jcamp;
use ftir_core::readers::model::{Limits, Options};

fn jcamp_with(sampling: Option<&str>) -> Vec<u8> {
    let line = sampling.map_or(String::new(), |s| format!("##SAMPLING PROCEDURE={s}\n"));
    format!(
        "##TITLE=t\n##JCAMP-DX=5.01\n##DATA TYPE=INFRARED SPECTRUM\n{line}##XUNITS=1/CM\n##YUNITS=ABSORBANCE\n\
         ##XFACTOR=1\n##YFACTOR=1\n##FIRSTX=1000\n##LASTX=1004\n##NPOINTS=3\n##FIRSTY=0.1\n\
         ##XYDATA=(X++(Y..Y))\n1000 0.1 0.2 0.3\n##END=\n"
    )
    .into_bytes()
}

fn sampling_of(text: Option<&str>) -> Option<&'static str> {
    let doc = jcamp::open(&jcamp_with(text), &Limits::STANDARD, &Options::default()).expect("open");
    doc.spectra[doc.primary].instrument.sampling
}

#[test]
fn jcamp_sampling_procedure_gives_an_id_only_when_it_says_enough() {
    assert_eq!(sampling_of(Some("Diamond ATR")), Some("atr_diamond"));
    assert_eq!(sampling_of(Some("ATR, germanium crystal")), Some("atr_ge"));
    assert_eq!(sampling_of(Some("KBr pellet")), Some("transmission_kbr"));
    assert_eq!(sampling_of(Some("ATR")), None);
    assert_eq!(sampling_of(Some("transmission")), None);
    assert_eq!(sampling_of(None), None);
}

#[test]
fn every_id_of_the_list_is_known_and_unknown_is_not_a_method() {
    use ftir_core::campionamento::{known, normalise, IDS};
    for id in IDS {
        assert_eq!(known(id), Some(id));
    }
    assert_eq!(normalise("unknown"), None);
    assert_eq!(known("ATR"), None);
}
