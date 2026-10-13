//! Cleans one `.ispd` with the contract `anonimizza/1` and prints, as JSON on stdout, only what the demo files need:
//! the main spectrum, the two interferograms, the kept parameters and the cleaning report (never a value of a stripped field).
//! Run by hand by `tools/demo/genera_demo.py`, outside CI: `cargo run --release -p ftir-core --example export_demo -- FILE.ispd`.
use ftir_core::anonimizza::{clean, Report};
use ftir_core::readers::ispd;
use ftir_core::readers::model::{Limits, Options, Role, Spectrum, XUnit};

fn numbers(v: &[f64]) -> String {
    let items: Vec<String> = v.iter().map(|x| format!("{x:?}")).collect();
    format!("[{}]", items.join(","))
}

fn spectrum_json(name: &str, s: &Spectrum) -> String {
    format!(
        "{{\"name\":\"{name}\",\"x_unit\":\"{:?}\",\"y_unit\":\"{:?}\",\"x\":{},\"y\":{}}}",
        s.x.unit,
        s.y.unit,
        numbers(&s.x.values.to_vec()),
        numbers(&s.y.values)
    )
}

fn report_json(r: &Report) -> String {
    let rows: Vec<String> = r
        .changes
        .iter()
        .map(|c| {
            format!(
                "{{\"scope\":\"{}\",\"key\":\"{}\",\"action\":\"{}\",\"count\":{}}}",
                c.scope,
                c.key.replace('"', "'"),
                c.action.word(),
                c.count
            )
        })
        .collect();
    format!("{{\"kept\":{},\"changes\":[{}]}}", r.kept, rows.join(","))
}

/// The value of a kept field by its normalised key, from the main spectrum only.
fn field<'a>(s: &'a Spectrum, key: &str) -> Option<&'a str> {
    s.fields
        .iter()
        .find(|f| f.key == key)
        .map(|f| f.value.as_str())
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: export_demo FILE.ispd");
    let bytes = std::fs::read(&path).expect("cannot read the file");
    let opened = (ispd::READER.open)(&bytes, &Limits::STANDARD, &Options::default());
    let (doc, report) = clean(&opened.expect("cannot open the file"));
    let main = doc.spectra.get(doc.primary).expect("no main spectrum");
    assert!(
        main.x.unit == XUnit::Cm1,
        "the main spectrum is not in wavenumbers"
    );
    let mut out = vec![spectrum_json("main", main)];
    for (role, name) in [
        (Role::SampleInterferogram, "sample_interferogram"),
        (Role::BackgroundInterferogram, "background_interferogram"),
    ] {
        if let Some(s) = doc.spectra.iter().find(|s| s.role == role) {
            out.push(spectrum_json(name, s));
        }
    }
    let resolution = main.instrument.resolution_cm1.as_ref().map(|r| r.value);
    println!(
        "{{\"measured\":\"{}\",\"model\":\"{}\",\"resolution_cm1\":{},\"spectra\":[{}],\"report\":{}}}",
        field(main, "CREATED").unwrap_or(""),
        field(main, "param.1200").unwrap_or(""),
        resolution.map_or("null".to_string(), |r| format!("{r:?}")),
        out.join(","),
        report_json(&report)
    );
}
