//! `single_beam`: parity with NumPy (fixtures from `tools/single_beam_riferimento.py`), the centre burst, the
//! `computed_by` marks and «never block» (any damaged input is an error value or «not evaluable», never a panic).
use ftir_core::measurement_quality::{Outcome, Thresholds};
use ftir_core::passi::json::{parse, Value};
use ftir_core::readers::model::{
    is_computed, Background, BackgroundKind, Document, Instrument, Measurement, Order, Provenance,
    Role, Spectrum, XAxis, XUnit, XValues, YAxis, YUnit,
};
use ftir_core::single_beam::{absorbance, channel, energy, recompute};

const TOLERANCE: f64 = 1e-9;

fn floats(v: &Value, key: &str) -> Vec<f64> {
    let list = v.get(key).and_then(Value::as_arr).unwrap();
    list.iter().map(|x| x.as_f64().unwrap()).collect()
}

fn fixture() -> Value {
    parse(include_str!("golden/single_beam/parity.json")).unwrap()
}

fn close(got: &[f64], want: &[f64], what: &str) {
    assert_eq!(got.len(), want.len(), "{what}");
    let scale = want.iter().fold(0.0_f64, |m, v| m.max(v.abs())).max(1.0);
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
        assert!(
            (g - w).abs() <= TOLERANCE * scale,
            "{what}[{i}]: {g} vs {w}"
        );
    }
}

#[test]
fn channels_and_absorbance_match_numpy() {
    let data = fixture();
    let cases = data.get("cases").and_then(Value::as_arr).unwrap();
    assert!(cases.len() >= 2);
    for case in cases {
        let step = case.get("step_cm").and_then(Value::as_f64).unwrap();
        let cs = channel(&floats(case, "sample"), step).unwrap();
        let cb = channel(&floats(case, "background"), step).unwrap();
        assert_eq!(
            cs.centre as f64,
            case.get("centre_sample").and_then(Value::as_f64).unwrap()
        );
        assert_eq!(
            cb.centre as f64,
            case.get("centre_background")
                .and_then(Value::as_f64)
                .unwrap()
        );
        close(&cs.magnitude, &floats(case, "magnitude_sample"), "sample");
        close(
            &cb.magnitude,
            &floats(case, "magnitude_background"),
            "background",
        );
        let a = absorbance(&cs, &cb, &floats(case, "target_cm1"));
        close(&a, &floats(case, "absorbance"), "absorbance");
    }
}

fn interferogram(role: Role, values: Vec<f64>, step: f64) -> Spectrum {
    let n = values.len();
    Spectrum {
        role,
        x: XAxis {
            unit: XUnit::Cm,
            order: Order::Ascending,
            values: XValues::Regular {
                first: -step * (n / 2) as f64,
                last: step * (n - 1 - n / 2) as f64,
                n,
            },
        },
        y: YAxis {
            unit: YUnit::Interferogram,
            values,
            quantum: None,
        },
        instrument: Instrument::default(),
        measurement: Measurement::default(),
        history: Vec::new(),
        fields: Vec::new(),
        warnings: Vec::new(),
    }
}

fn main_spectrum(n: usize) -> Spectrum {
    let mut s = interferogram(Role::Sample, vec![0.0; n], 1.0);
    s.x = XAxis {
        unit: XUnit::Cm1,
        order: Order::Descending,
        values: XValues::Regular {
            first: 4000.0,
            last: 600.0,
            n,
        },
    };
    s.y.unit = YUnit::Absorbance;
    s
}

fn document(sample: Vec<f64>, background: Vec<f64>) -> Document {
    let spectra = vec![
        main_spectrum(300),
        interferogram(Role::SampleInterferogram, sample, 1.0 / 15800.0),
        interferogram(Role::BackgroundInterferogram, background, 1.0 / 15800.0),
    ];
    let background = Background::find(&spectra);
    Document {
        spectra,
        primary: 0,
        background,
        fields: Vec::new(),
        warnings: Vec::new(),
        provenance: Provenance {
            reader: "test",
            reader_version: "1",
            format: String::new(),
            variant: String::new(),
            sha256: String::new(),
            size: 0,
        },
    }
}

fn burst(n: usize, centre: usize, amp: f64) -> Vec<f64> {
    (0..n)
        .map(|i| {
            let d = i as f64 - centre as f64;
            2.0 + amp * (-(d * d) / 40.0).exp() * (0.4 * d).cos()
        })
        .collect()
}

#[test]
fn the_centre_burst_is_found_wherever_it_is() {
    for centre in [10, 256, 700] {
        let c = channel(&burst(1024, centre, 1.0), 1.0 / 15800.0).unwrap();
        assert_eq!(c.centre, centre);
    }
}

#[test]
fn recomputed_data_is_marked_as_computed_by_checkir() {
    let d = document(burst(1024, 512, 0.9), burst(1024, 512, 1.0));
    assert_eq!(d.background.present, BackgroundKind::Interferogram);
    let r = recompute(&d).unwrap();
    for s in [&r.sample, &r.background, &r.absorbance] {
        assert!(s.history.iter().all(|h| is_computed(h)) && !s.history.is_empty());
    }
    assert_eq!(r.sample.y.unit, YUnit::SingleBeam);
    assert_eq!(r.absorbance.y.unit, YUnit::Absorbance);
    assert_eq!(r.absorbance.y.values.len(), 300);
}

#[test]
fn a_weaker_background_gives_a_low_energy_ratio() {
    let t = Thresholds::embedded().unwrap();
    let d = document(burst(1024, 512, 0.9), burst(1024, 512, 1.0));
    let (e, _) = energy::background_energy(&d).unwrap();
    assert!(e > 0.0);
    let low = energy::check(&d, &t, Some(e * 4.0));
    assert_eq!(
        (low.outcome, low.id),
        (Outcome::Attention, "background_energy")
    );
    assert_eq!(energy::check(&d, &t, Some(e)).outcome, Outcome::NoSignal);
    // Without a reference the check cannot judge: not evaluable, never «ok».
    assert_eq!(energy::check(&d, &t, None).outcome, Outcome::NotEvaluable);
}

#[test]
fn damaged_input_never_blocks() {
    let t = Thresholds::embedded().unwrap();
    let good = burst(1024, 512, 1.0);
    let mut nan = good.clone();
    nan[7] = f64::NAN;
    let cases = [
        document(good.clone(), burst(1000, 500, 1.0)),
        document(good.clone(), vec![5.0; 1024]),
        document(good.clone(), nan),
        document(Vec::new(), Vec::new()),
        document(good.clone(), vec![f64::INFINITY; 8]),
    ];
    for d in &cases {
        let _ = recompute(d); // an error value is fine, a panic is not
        for reference in [None, Some(0.0), Some(f64::NAN), Some(3.0)] {
            let c = energy::check(d, &t, reference);
            assert!(matches!(
                c.outcome,
                Outcome::NotEvaluable | Outcome::NoSignal | Outcome::Attention
            ));
        }
    }
    let mut nobg = document(good.clone(), good);
    nobg.background = Background::NONE;
    assert_eq!(
        recompute(&nobg).unwrap_err().error_key,
        "single_beam.missing"
    );
    assert_eq!(
        energy::check(&nobg, &t, Some(1.0)).outcome,
        Outcome::NotEvaluable
    );
    assert_eq!(
        channel(&[1.0; 100], 1.0).unwrap_err().error_key,
        "single_beam.length"
    );
}
