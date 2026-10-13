//! Synthetic `.ispd` fixtures: a minimal Berkeley DB hash file (version 5, little endian) written from scratch, with
//! invented objects (no real names, codes or serial numbers). The official `db_dump` must read them
//! (`tools/ispd_riferimento.py fixtures`), so that the writer and the reader do not share the same mistake.
use crate::readers::sha256::sha256_hex;

pub type Pairs = Vec<(Vec<u8>, Vec<u8>)>;

const HASH_MAGIC: u32 = 0x0006_1561;
const BUCKETS: usize = 4;
const HEADER: usize = 26;

fn put32(page: &mut [u8], off: usize, v: u32) {
    if let Some(s) = page.get_mut(off..off + 4) {
        s.copy_from_slice(&v.to_le_bytes());
    }
}

fn put16(page: &mut [u8], off: usize, v: usize) {
    if let Some(s) = page.get_mut(off..off + 2) {
        s.copy_from_slice(&u16::try_from(v).unwrap_or(0).to_le_bytes());
    }
}

fn pgno(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(0)
}

/// Pages being written: page 0 is the meta page, then one page per bucket, then overflow pages.
struct Writer {
    size: usize,
    pages: Vec<Vec<u8>>,
}

impl Writer {
    fn alloc(&mut self, kind: u8) -> usize {
        let n = self.pages.len();
        let mut p = vec![0u8; self.size];
        put32(&mut p, 8, pgno(n));
        if let Some(b) = p.get_mut(25) {
            *b = kind;
        }
        self.pages.push(p);
        n
    }

    /// Writes `data` on a chain of overflow pages; the chain starts at the highest page and goes down, like in real files.
    fn overflow(&mut self, data: &[u8]) -> usize {
        let room = self.size - HEADER;
        let chunks: Vec<&[u8]> = data.chunks(room).collect();
        let mut order: Vec<usize> = chunks.iter().map(|_| self.alloc(7)).collect();
        order.reverse();
        for (i, chunk) in chunks.iter().enumerate() {
            let id = order.get(i).copied().unwrap_or(0);
            let next = order.get(i + 1).copied().unwrap_or(0);
            let prev = i
                .checked_sub(1)
                .and_then(|j| order.get(j))
                .copied()
                .unwrap_or(0);
            if let Some(p) = self.pages.get_mut(id) {
                put16(p, 22, chunk.len());
                if let Some(s) = p.get_mut(HEADER..HEADER + chunk.len()) {
                    s.copy_from_slice(chunk);
                }
                put32(p, 12, pgno(prev));
                put32(p, 16, pgno(next));
            }
        }
        order.first().copied().unwrap_or(0)
    }
    fn item(&mut self, v: &[u8]) -> Vec<u8> {
        if v.len() + 1 > (self.size - HEADER) / 4 {
            let first = self.overflow(v);
            let mut it = vec![3u8, 0, 0, 0];
            it.extend_from_slice(&pgno(first).to_le_bytes());
            it.extend_from_slice(&pgno(v.len()).to_le_bytes());
            it
        } else {
            let mut it = vec![1u8];
            it.extend_from_slice(v);
            it
        }
    }
}

/// Fills the chain of hash pages of a bucket with the already encoded items (key, value, key, value, ...).
fn fill(w: &mut Writer, first: usize, items: &[Vec<u8>]) {
    let mut page = first;
    let mut entries = 0usize;
    let mut low = w.size;
    for pair in items.chunks(2) {
        let need: usize = pair.iter().map(Vec::len).sum::<usize>() + 4;
        if low < HEADER + 2 * entries + need {
            let next = w.alloc(2);
            if let Some(p) = w.pages.get_mut(next) {
                put32(p, 12, pgno(page));
            }
            if let Some(p) = w.pages.get_mut(page) {
                put32(p, 16, pgno(next));
            }
            page = next;
            entries = 0;
            low = w.size;
        }
        for it in pair {
            low -= it.len();
            if let Some(p) = w.pages.get_mut(page) {
                if let Some(s) = p.get_mut(low..low + it.len()) {
                    s.copy_from_slice(it);
                }
                put16(p, HEADER + 2 * entries, low);
                put16(p, 20, entries + 1);
                put16(p, 22, low);
            }
            entries += 1;
        }
    }
}

fn bucket_of(key: &[u8]) -> usize {
    let h = key
        .iter()
        .fold(0u32, |h, &b| h.wrapping_mul(16_777_619) ^ u32::from(b));
    usize::try_from(h).unwrap_or(0) % BUCKETS
}

/// Writes a Berkeley DB hash database version 5 holding `pairs`.
pub fn write_hash(pairs: &Pairs, page_size: usize) -> Vec<u8> {
    let mut w = Writer {
        size: page_size,
        pages: Vec::new(),
    };
    w.alloc(8);
    let heads: Vec<usize> = (0..BUCKETS).map(|_| w.alloc(2)).collect();
    let mut items: Vec<Vec<Vec<u8>>> = vec![Vec::new(); BUCKETS];
    for (k, v) in pairs {
        let (ik, iv) = (w.item(k), w.item(v));
        if let Some(list) = items.get_mut(bucket_of(k)) {
            list.push(ik);
            list.push(iv);
        }
    }
    for (head, list) in heads.iter().zip(&items) {
        fill(&mut w, *head, list);
    }
    let total = w.pages.len() - 1 - BUCKETS;
    if let Some(m) = w.pages.first_mut() {
        put32(m, 12, HASH_MAGIC);
        put32(m, 16, 5);
        put32(m, 20, pgno(page_size));
        put32(m, 24, 2);
        put32(m, 32, pgno(BUCKETS - 1));
        put32(m, 36, 3);
        put32(m, 40, 1);
        put32(m, 48, pgno(pairs.len()));
        put32(m, 56 + 4 * 3, pgno(total));
    }
    w.pages.concat()
}

/// Digest of the container as `tools/ispd_riferimento.py` computes it (pair count and digest of sorted fingerprints).
pub fn container_digest(pairs: &Pairs) -> (usize, String) {
    let mut prints: Vec<String> = pairs
        .iter()
        .map(|(k, v)| {
            let mut b = pgno(k.len()).to_le_bytes().to_vec();
            b.extend_from_slice(k);
            b.extend_from_slice(v);
            sha256_hex(&b)
        })
        .collect();
    prints.sort();
    (prints.len(), sha256_hex(prints.join("\n").as_bytes()))
}

/// What the fixture contains, for the tests (the truth of the main spectrum).
pub struct Truth {
    pub main_object: u32,
    pub name: String,
    pub created_unix: u32,
    pub first_cm1: f64,
    pub last_cm1: f64,
    pub y: Vec<f64>,
    pub y_unit: &'static str,
}

pub struct Fixture {
    pub name: &'static str,
    pub pairs: Pairs,
    pub bytes: Vec<u8>,
    pub truth: Truth,
}

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

fn header_blob(name: &str, created: u32, history: &[&str]) -> Vec<u8> {
    let mut h = vec![0u8; 168];
    put32(&mut h, 0, 2);
    put32(&mut h, 4, 36);
    h.extend_from_slice(&created.to_le_bytes());
    h.extend_from_slice(&pgno(name.len()).to_le_bytes());
    h.extend_from_slice(name.as_bytes());
    for text in history {
        for part in ["Mario", "Mario Prova", "NA"] {
            h.extend_from_slice(&pgno(part.len()).to_le_bytes());
            h.extend_from_slice(part.as_bytes());
        }
        h.extend_from_slice(&created.to_le_bytes());
        h.extend_from_slice(&pgno(text.len()).to_le_bytes());
        h.extend_from_slice(text.as_bytes());
    }
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

#[allow(clippy::too_many_arguments)]
fn spectrum_object(
    obj: u32,
    name: &str,
    unit_x: &str,
    unit_y: &str,
    y: &[f64],
    r: (f64, f64),
    history: &[&str],
    out: &mut Pairs,
) {
    let props: [(&str, Vec<u8>); 6] = [
        ("100001 ", descriptor(unit_x)),
        ("100003 ", descriptor(unit_y)),
        ("100008 ", doubles(y)),
        ("100036 ", range(r.0, r.1)),
        ("2 Description", b"\0".to_vec()),
        ("NON_BTREE_DATA", header_blob(name, 1_781_000_000, history)),
    ];
    out.push((key(obj, "100000 "), vec![0x68; 52]));
    for (k, v) in props {
        out.push((key(obj, k), v));
    }
}

fn build(name: &'static str, order: [(u32, &'static str); 2]) -> Fixture {
    let y = bands(100, 650.0, 3999.0);
    let sub = bands(60, 650.0, 3999.0)
        .iter()
        .map(|v| v * 0.5)
        .collect::<Vec<_>>();
    let mut pairs: Pairs = vec![
        (key(1, "103700 FTIRX000 Instrument Parameters"), vec![7; 40]),
        (key(1, "MEMBERS"), vec![1; 16]),
        (b"AO\0".to_vec(), vec![19, 0, 0, 0]),
        (
            b"CD\0".to_vec(),
            b"C:\\Users\\Mario\\Prova\\fixture.ispd\0".to_vec(),
        ),
        (b"CO\0".to_vec(), vec![0; 24]),
    ];
    let mut main_object = 0;
    let mut main_name = String::new();
    for (obj, label) in order {
        if label.starts_with("Subtraction") {
            spectrum_object(
                obj,
                label,
                "cm-1",
                "Abs",
                &sub,
                (650.0, 3999.0),
                &["Search: Subtraction, Factor=1.0"],
                &mut pairs,
            );
        } else {
            main_object = obj;
            main_name = label.to_string();
            spectrum_object(
                obj,
                label,
                "cm-1",
                "Abs",
                &y,
                (650.0, 3999.0),
                &["Scan on TestSpirit, SNO: A00000000000"],
                &mut pairs,
            );
        }
    }
    let igram: Vec<f64> = (0..1024).map(|i| f64::from(i).sin()).collect();
    spectrum_object(
        9,
        "Interferogram",
        "cm",
        "E",
        &igram,
        (-0.3, 0.3),
        &[],
        &mut pairs,
    );
    let bytes = write_hash(&pairs, 4096);
    Fixture {
        name,
        pairs,
        bytes,
        truth: Truth {
            main_object,
            name: main_name,
            created_unix: 1_781_000_000,
            first_cm1: 650.0,
            last_cm1: 3999.0,
            y,
            y_unit: "absorbance",
        },
    }
}

pub fn fixtures() -> Vec<Fixture> {
    vec![
        build("measurement", [(2, "Mario_Prova_1"), (6, "Subtraction1")]),
        build(
            "subtraction_first",
            [(2, "Subtraction1"), (3, "Mario_Prova_2")],
        ),
    ]
}

pub fn truth_json(f: &Fixture) -> String {
    let (n, digest) = container_digest(&f.pairs);
    let ys: Vec<String> = f.truth.y.iter().map(|v| format!("{v:?}")).collect();
    format!(
        "{{\n  \"name\": \"{}\",\n  \"container\": {{\"pairs\": {n}, \"digest\": \"{digest}\"}},\n  \"main_object\": {},\n  \"object_name\": \"{}\",\n  \"created_unix\": {},\n  \"first_cm1\": {:?},\n  \"last_cm1\": {:?},\n  \"y_unit\": \"{}\",\n  \"y\": [{}]\n}}\n",
        f.name,
        f.truth.main_object,
        f.truth.name,
        f.truth.created_unix,
        f.truth.first_cm1,
        f.truth.last_cm1,
        f.truth.y_unit,
        ys.join(", ")
    )
}
