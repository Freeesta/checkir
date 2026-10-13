//! Mutated and truncated inputs must never panic or hang: every reader answers with a document or a translated error.
//! (A fixed-seed stand-in for the nightly fuzzing; every crash found by `cargo fuzz` becomes a case here.)
use ftir_core::readers::model::{Limits, Options};
use ftir_core::readers::READERS;
use ftir_core::synthetic_jcamp::fixtures;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }
}

fn corpus() -> Vec<Vec<u8>> {
    let mut c: Vec<Vec<u8>> = fixtures().into_iter().map(|f| f.bytes).collect();
    c.extend(
        ftir_core::synthetic_ispd::fixtures()
            .into_iter()
            .map(|f| f.bytes),
    );
    c.extend(
        ftir_core::synthetic_spa::fixtures()
            .iter()
            .map(|(_, s)| ftir_core::synthetic_spa::build(s)),
    );
    c.extend(
        ftir_core::synthetic_spc::fixtures()
            .iter()
            .map(|(_, s)| ftir_core::synthetic_spc::build(s)),
    );
    c.push(b"Wavenumber;Abs\r\n4000,1;0,5\r\n3990,2;0,6\r\n3980,3;0,7\r\n".to_vec());
    c.push(b"FIRSTX: 4000\nLASTX: 400\n0.1\n0.2\n0.3\n".to_vec());
    c.push(b"##TITLE=x\r\n##XYDATA=(X++(Y..Y))\r\n1 A1B2J3S9T\r\n2 %%%%\r\n".to_vec());
    c
}

#[test]
fn mutations_never_panic() {
    let limits = Limits {
        max_points: 5000,
        max_bytes: 1 << 20,
        ..Limits::STANDARD
    };
    let mut rng = Rng(42);
    let alphabet = b"#=$ ,;\t\r\n.-+0123456789EeAaJjSs%@()?";
    for seed in corpus() {
        for round in 0..60 {
            let mut b = seed.clone();
            for _ in 0..=round % 6 {
                match rng.below(4) {
                    0 if !b.is_empty() => {
                        let i = rng.below(b.len());
                        b[i] = alphabet[rng.below(alphabet.len())];
                    }
                    1 if !b.is_empty() => {
                        let i = rng.below(b.len());
                        b.truncate(i);
                    }
                    2 => {
                        let i = rng.below(b.len() + 1);
                        b.insert(i, alphabet[rng.below(alphabet.len())]);
                    }
                    _ if !b.is_empty() => {
                        let i = rng.below(b.len());
                        b.remove(i);
                    }
                    _ => {}
                }
            }
            for r in READERS {
                let _ = (r.detect)("x.csv", &b);
                match (r.open)(&b, &limits, &Options::default()) {
                    Ok(d) => assert!(!d.spectra.is_empty()),
                    Err(e) => assert!(e.key.starts_with("reader."), "{}", e.key),
                }
            }
        }
    }
}

#[test]
fn hostile_shapes_are_bounded() {
    let limits = Limits {
        max_points: 1000,
        max_bytes: 1 << 20,
        max_header_lines: 50,
        ..Limits::STANDARD
    };
    let mut cases: Vec<Vec<u8>> = vec![
        vec![b'#'; 100_000],
        vec![0u8; 5000],
        b"##TITLE=".repeat(5000),
        "1,2\n".repeat(100_000).into_bytes(),
        "x\n".repeat(100_000).into_bytes(),
    ];
    cases.push(
        format!(
            "##TITLE=x\r\n##XYDATA=(X++(Y..Y))\r\n1 {}\r\n##END=\r\n",
            "S9".repeat(1000)
        )
        .into_bytes(),
    );
    for c in &cases {
        for r in READERS {
            let _ = (r.open)(c, &limits, &Options::default());
        }
    }
}
