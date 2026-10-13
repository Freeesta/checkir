//! The synthetic `.ispd` fixtures: invented objects (sample, subtraction, interferograms, parameters) written into a
//! Berkeley DB hash file by `synthetic_ispd::write_hash`. No real names, codes or serial numbers.
use crate::synthetic_ispd::{container_digest, pgno, put32, write_hash, Pairs};

/// What the fixture contains, for the tests (the truth of the main spectrum and of the metadata).
pub struct Truth {
    pub main_object: u32,
    pub name: String,
    pub created_unix: u32,
    pub first_cm1: f64,
    pub last_cm1: f64,
    pub y: Vec<f64>,
    pub y_unit: &'static str,
    pub resolution_cm1: f64,
    pub scans: u32,
    pub model: &'static str,
    pub serial: &'static str,
    pub accessory: &'static str,
    pub alert: &'static str,
    pub history: Vec<String>,
}

pub struct Fixture {
    pub name: &'static str,
    pub pairs: Pairs,
    pub bytes: Vec<u8>,
    pub truth: Truth,
}

const CREATED: u32 = 1_781_000_000;
const SERIAL: &str = "A00000000000";
const ACCESSORY: &str = "1102 (S0000TEST)";
const ALERT: &str = "Piezo Voltage out of range (PH Low)";
const MODEL: &str = "TestSpirit-X";

fn key(obj: u32, rest: &str) -> Vec<u8> {
    let mut k = format!("{obj} {rest}").into_bytes();
    k.push(0);
    k
}

fn descriptor(unit: &str) -> Vec<u8> {
    let mut d = vec![0u8; 144];
    put32(&mut d, 8, 12);
    if let Some(s) = d.get_mut(12..12 + unit.len()) {
        s.copy_from_slice(unit.as_bytes());
    }
    d
}

fn range(first: f64, last: f64) -> Vec<u8> {
    let mut r = vec![0u8; 64];
    for (i, v) in [first, 0.0, 0.0, last, 1.0, 1.0].iter().enumerate() {
        if let Some(s) = r.get_mut(16 + 8 * i..24 + 8 * i) {
            s.copy_from_slice(&v.to_le_bytes());
        }
    }
    r
}

fn text(out: &mut Vec<u8>, t: &str) {
    out.extend_from_slice(&pgno(t.len()).to_le_bytes());
    out.extend_from_slice(t.as_bytes());
}

/// `NON_BTREE_DATA`: a fixed part, creation date, name, then the history in the layout of the instrument software.
fn header_blob(name: &str, history: &[&str]) -> Vec<u8> {
    let mut h = vec![0u8; 168];
    put32(&mut h, 0, 2);
    put32(&mut h, 4, 36);
    h.extend_from_slice(&CREATED.to_le_bytes());
    text(&mut h, name);
    let mut entries = pgno(history.len()).to_le_bytes().to_vec();
    for t in history {
        for part in ["Mario", "Mario Prova", "NA"] {
            text(&mut entries, part);
        }
        entries.extend_from_slice(&CREATED.to_le_bytes());
        text(&mut entries, t);
    }
    h.extend_from_slice(&1u32.to_le_bytes());
    h.extend_from_slice(&9u32.to_le_bytes());
    h.extend_from_slice(&pgno(entries.len()).to_le_bytes());
    h.extend_from_slice(&entries);
    h
}

fn doubles(v: &[f64]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

/// Two Gaussian bands on a flat base, from `first` to `last` cm-1.
fn bands(n: usize, first: f64, last: f64) -> Vec<f64> {
    (0..n)
        .map(|i| {
            let x = first + (last - first) * i as f64 / (n - 1) as f64;
            let g = |c: f64, w: f64, a: f64| a * (-((x - c) / w).powi(2)).exp();
            0.02 + g(1700.0, 40.0, 0.8) + g(2900.0, 60.0, 0.3)
        })
        .collect()
}

struct Object<'a> {
    id: u32,
    name: &'a str,
    x_unit: &'a str,
    y_unit: &'a str,
    y: &'a [f64],
    range: (f64, f64),
    history: &'a [&'a str],
}

fn spectrum_object(o: &Object<'_>, out: &mut Pairs) {
    let props: [(&str, Vec<u8>); 6] = [
        ("100001 ", descriptor(o.x_unit)),
        ("100003 ", descriptor(o.y_unit)),
        ("100008 ", doubles(o.y)),
        ("100036 ", range(o.range.0, o.range.1)),
        ("2 Description", b"\0".to_vec()),
        ("NON_BTREE_DATA", header_blob(o.name, o.history)),
    ];
    out.push((key(o.id, "100000 "), vec![0x68; 52]));
    for (k, v) in props {
        out.push((key(o.id, k), v));
    }
}

fn entry(out: &mut Vec<u8>, id: i32, ty: i32, body: &[u8]) {
    out.extend_from_slice(&id.to_le_bytes());
    out.extend_from_slice(&ty.to_le_bytes());
    out.extend_from_slice(body);
}

fn string_body(t: &str) -> Vec<u8> {
    let mut b = Vec::new();
    text(&mut b, t);
    b
}

/// The parameter list: scans, resolution, a comment, the model, an id the reader does not know, a byte.
fn parameters() -> Vec<u8> {
    let mut v = 6u32.to_le_bytes().to_vec();
    entry(&mut v, 1002, 4, &15i32.to_le_bytes());
    entry(&mut v, 1004, 8, &4.0f64.to_le_bytes());
    entry(&mut v, 1032, 8, &string_body("Mario Prova comment"));
    entry(&mut v, 1200, 8, &string_body(MODEL));
    entry(&mut v, 7777, 8, &string_body("zz"));
    entry(&mut v, 1062, 1, &[3]);
    v
}

fn base_pairs() -> Pairs {
    vec![
        (
            key(1, "103700 FTIRX000 Instrument Parameters"),
            parameters(),
        ),
        (key(1, "MEMBERS"), vec![1; 16]),
        (b"AO\0".to_vec(), vec![19, 0, 0, 0]),
        (
            b"CD\0".to_vec(),
            b"C:\\Users\\Mario\\Prova\\fixture.ispd\0".to_vec(),
        ),
        (b"CO\0".to_vec(), vec![0; 24]),
    ]
}

fn build(name: &'static str, order: [(u32, &'static str); 2]) -> Fixture {
    let y = bands(100, 650.0, 3999.0);
    let sub: Vec<f64> = y.iter().map(|v| v * 0.5).collect();
    let scan = format!("Scan on TestSpirit, SNO: {SERIAL}");
    let acc = format!("Measured with accessory: {ACCESSORY}");
    let main_history = [scan.as_str(), acc.as_str(), ALERT];
    let mut pairs = base_pairs();
    let (mut main_object, mut main_name) = (0, String::new());
    for (id, label) in order {
        let sub_obj = label.starts_with("Subtraction");
        if !sub_obj {
            (main_object, main_name) = (id, label.to_string());
        }
        spectrum_object(
            &Object {
                id,
                name: label,
                x_unit: "cm-1",
                y_unit: "Abs",
                y: if sub_obj { &sub } else { &y },
                range: (650.0, 3999.0),
                history: if sub_obj {
                    &["Search: Subtraction, Factor=1.0"]
                } else {
                    &main_history
                },
            },
            &mut pairs,
        );
    }
    let igram: Vec<f64> = (0..1024).map(|i| f64::from(i).sin()).collect();
    for (id, label, hist) in [
        (9, "Interferogram", &[scan.as_str()][..]),
        (
            10,
            "Background Interferogram",
            &["Copied from BKG spectrum"][..],
        ),
    ] {
        let o = Object {
            id,
            name: label,
            x_unit: "cm",
            y_unit: "E",
            y: &igram,
            range: (-0.3, 0.3),
            history: hist,
        };
        spectrum_object(&o, &mut pairs);
    }
    let bytes = write_hash(&pairs, 4096);
    let truth = Truth {
        main_object,
        name: main_name,
        created_unix: CREATED,
        first_cm1: 650.0,
        last_cm1: 3999.0,
        y,
        y_unit: "absorbance",
        resolution_cm1: 4.0,
        scans: 15,
        model: MODEL,
        serial: SERIAL,
        accessory: ACCESSORY,
        alert: ALERT,
        history: main_history.iter().map(ToString::to_string).collect(),
    };
    Fixture {
        name,
        pairs,
        bytes,
        truth,
    }
}

/// A library file imported from JCAMP whose Y values were stored unscaled (x 1e9) and whose axis is rounded.
fn library_raw() -> Fixture {
    let ok = bands(100, 401.121094, 3999.640137);
    let y: Vec<f64> = ok.iter().map(|v| v * 1e9).collect();
    let min = ok.iter().copied().fold(f64::INFINITY, f64::min);
    let mut pairs: Pairs = vec![
        (key(1, "0 ##MINX"), b"401.121094\0".to_vec()),
        (key(1, "0 ##MINY"), format!("{min:.6}\0").into_bytes()),
        (key(1, "100001 "), descriptor("cm-1")),
        (key(1, "100003 "), descriptor("Abs")),
        (key(1, "100008 "), doubles(&y)),
        (key(1, "100036 "), range(401.0, 3999.0)),
        (key(1, "NON_BTREE_DATA"), vec![1; 40]),
    ];
    pairs.push((b"CD\0".to_vec(), b"x\0".to_vec()));
    let bytes = write_hash(&pairs, 4096);
    let truth = Truth {
        main_object: 1,
        name: String::new(),
        created_unix: 0,
        first_cm1: 401.0,
        last_cm1: 3999.0,
        y,
        y_unit: "arbitrary",
        resolution_cm1: 0.0,
        scans: 0,
        model: "",
        serial: "",
        accessory: "",
        alert: "",
        history: Vec::new(),
    };
    Fixture {
        name: "library_raw",
        pairs,
        bytes,
        truth,
    }
}

pub fn fixtures() -> Vec<Fixture> {
    vec![
        library_raw(),
        build("measurement", [(2, "Mario_Prova_1"), (6, "Subtraction1")]),
        build(
            "subtraction_first",
            [(2, "Subtraction1"), (3, "Mario_Prova_2")],
        ),
    ]
}

pub fn truth_json(f: &Fixture) -> String {
    let (n, digest) = container_digest(&f.pairs);
    let t = &f.truth;
    let ys: Vec<String> = t.y.iter().map(|v| format!("{v:?}")).collect();
    let hist: Vec<String> = t.history.iter().map(|h| format!("\"{h}\"")).collect();
    format!(
        "{{\n  \"name\": \"{}\",\n  \"container\": {{\"pairs\": {n}, \"digest\": \"{digest}\"}},\n  \"main_object\": {},\n  \"object_name\": \"{}\",\n  \"created_unix\": {},\n  \"first_cm1\": {:?},\n  \"last_cm1\": {:?},\n  \"y_unit\": \"{}\",\n  \"resolution_cm1\": {:?},\n  \"scans\": {},\n  \"model\": \"{}\",\n  \"serial\": \"{}\",\n  \"accessory\": \"{}\",\n  \"alert\": \"{}\",\n  \"history\": [{}],\n  \"y\": [{}]\n}}\n",
        f.name, t.main_object, t.name, t.created_unix, t.first_cm1, t.last_cm1, t.y_unit,
        t.resolution_cm1, t.scans, t.model, t.serial, t.accessory, t.alert, hist.join(", "), ys.join(", ")
    )
}
