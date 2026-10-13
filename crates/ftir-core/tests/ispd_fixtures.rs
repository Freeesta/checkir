//! `.ispd` reader on synthetic fixtures: container, main spectrum, loss audit, anonymity, malformed files.
use ftir_core::readers::anonymize::anonymize;
use ftir_core::readers::bdb;
use ftir_core::readers::export::to_json;
use ftir_core::readers::ispd;
use ftir_core::readers::model::{
    Document, FieldKind, Limits, Options, Order, XUnit, XValues, YUnit,
};
use ftir_core::synthetic_ispd::{fixtures, truth_json};
use std::collections::BTreeSet;

fn open(bytes: &[u8]) -> Result<Document, String> {
    ispd::open(bytes, &Limits::STANDARD, &Options::default()).map_err(|e| e.key.to_string())
}

fn dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ispd")
}

#[test]
fn committed_fixtures_are_up_to_date() {
    for f in fixtures() {
        let on_disk = std::fs::read(dir().join(format!("{}.ispd", f.name))).expect("fixture file");
        assert!(on_disk == f.bytes, "{}: rerun gen_ispd_fixtures", f.name);
        let truth =
            std::fs::read_to_string(dir().join(format!("{}.truth.json", f.name))).expect("truth");
        assert_eq!(truth, truth_json(&f), "{}", f.name);
    }
}

#[test]
fn container_gives_back_every_pair() {
    for f in fixtures() {
        let mut got: Vec<_> = bdb::read_hash(&f.bytes, &Limits::STANDARD)
            .expect("hash")
            .into_iter()
            .map(|p| (p.key, p.value))
            .collect();
        let mut want = f.pairs.clone();
        got.sort();
        want.sort();
        assert!(got == want, "{}", f.name);
    }
}

#[test]
fn main_spectrum_matches_the_truth() {
    for f in fixtures() {
        let d = open(&f.bytes).expect("open");
        assert_eq!(d.spectra.len(), 1);
        let s = &d.spectra[d.primary];
        assert_eq!(s.x.unit, XUnit::Cm1);
        assert_eq!(s.x.order, Order::Ascending);
        assert_eq!(
            s.x.values,
            XValues::Regular {
                first: f.truth.first_cm1,
                last: f.truth.last_cm1,
                n: f.truth.y.len()
            }
        );
        assert_eq!(s.y.unit, YUnit::Absorbance);
        assert!(s.y.values == f.truth.y, "{}", f.name);
        let title = s.measurement.title.as_ref().expect("title");
        assert_eq!(title.value, f.truth.name);
        assert_eq!(
            s.measurement.datetime.as_ref().map(|d| d.value.as_str()),
            Some("2026-06-09T10:13:20Z")
        );
        let source = &s.fields[title.field];
        assert_eq!(source.key, "NON_BTREE_DATA");
        assert_eq!(d.provenance.reader, "shimadzu-ispd");
    }
}

#[test]
fn every_pair_becomes_one_field_and_binary_is_never_copied() {
    for f in fixtures() {
        let d = open(&f.bytes).expect("open");
        let fields: Vec<_> = d
            .fields
            .iter()
            .chain(d.spectra.iter().flat_map(|s| s.fields.iter()))
            .collect();
        assert_eq!(fields.len(), f.pairs.len());
        let origins: BTreeSet<_> = fields.iter().map(|x| x.origin.clone()).collect();
        assert_eq!(origins.len(), fields.len(), "origins are unique");
        for x in &fields {
            assert!(x.known, "{} should be known", x.original_key);
            if x.kind == FieldKind::Bytes {
                assert!(x.value.contains("sha256 "), "{}", x.value);
            }
        }
        let identity: BTreeSet<_> = fields
            .iter()
            .filter(|x| x.identity)
            .map(|x| x.key.as_str())
            .collect();
        assert!(identity.contains("CD") && identity.contains("NON_BTREE_DATA"));
    }
}

#[test]
fn known_keys_file_matches_the_reader() {
    let text = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/audit/noti_ispd.txt"),
    )
    .expect("noti_ispd.txt");
    let listed: BTreeSet<&str> = text
        .lines()
        .filter(|l| !l.starts_with('#') && !l.is_empty())
        .collect();
    let known: BTreeSet<&str> = ispd::KNOWN.iter().copied().collect();
    assert_eq!(listed, known);
}

#[test]
fn main_spectrum_skips_subtractions() {
    let f = fixtures()
        .into_iter()
        .find(|f| f.name == "subtraction_first")
        .expect("fixture");
    let d = open(&f.bytes).expect("open");
    let s = &d.spectra[0];
    assert_eq!(
        s.measurement.title.as_ref().map(|t| t.value.as_str()),
        Some("Mario_Prova_2")
    );
    assert_eq!(s.y.values.len(), 100);
}

#[test]
fn anonymous_export_hides_the_identity() {
    for f in fixtures() {
        let d = open(&f.bytes).expect("open");
        let before = to_json(&d);
        let after = to_json(&anonymize(&d, b"local secret"));
        for secret in [
            f.truth.name.as_str(),
            "2026-06-09T10:13:20Z",
            "Mario",
            "fixture.ispd",
        ] {
            assert!(
                before.contains(secret) || secret == "Mario" || secret == "fixture.ispd",
                "{secret}"
            );
            assert!(!after.contains(secret), "{secret} survived in {}", f.name);
        }
    }
}

fn patched(mut b: Vec<u8>, edit: impl FnOnce(&mut Vec<u8>)) -> Vec<u8> {
    edit(&mut b);
    b
}

fn base() -> Vec<u8> {
    fixtures().remove(0).bytes
}

#[test]
fn malformed_files_give_translated_errors() {
    let b = base();
    let cases: Vec<(&str, Vec<u8>, &str)> = vec![
        (
            "magic",
            patched(b.clone(), |v| v[12] ^= 0xff),
            "reader.ispd.bdb_magic",
        ),
        (
            "version",
            patched(b.clone(), |v| v[16] = 9),
            "reader.ispd.bdb_version",
        ),
        (
            "btree",
            patched(b.clone(), |v| {
                v[12..16].copy_from_slice(&0x0005_3162u32.to_le_bytes())
            }),
            "reader.ispd.bdb_method",
        ),
        (
            "big endian",
            patched(b.clone(), |v| {
                v[12..16].copy_from_slice(&0x0006_1561u32.to_be_bytes())
            }),
            "reader.ispd.bdb_version",
        ),
        (
            "page size",
            patched(b.clone(), |v| {
                v[20..24].copy_from_slice(&1000u32.to_le_bytes())
            }),
            "reader.ispd.bdb_page_size",
        ),
        (
            "truncated",
            b[..b.len() - 4096].to_vec(),
            "reader.ispd.bdb_truncated",
        ),
        ("tiny", b[..100].to_vec(), "reader.ispd.bdb_truncated"),
    ];
    for (name, bytes, key) in cases {
        assert_eq!(open(&bytes).err().as_deref(), Some(key), "{name}");
    }
}

#[test]
fn overflow_chains_cannot_loop_or_lie() {
    let b = base();
    let size = 4096;
    let pages: Vec<usize> = (5..b.len() / size)
        .filter(|&p| b[p * size + 25] == 7)
        .collect();
    assert!(pages.len() >= 3, "fixture has overflow pages");
    let p = pages[0];
    let looped = patched(b.clone(), |v| {
        v[p * size + 16..p * size + 20].copy_from_slice(&u32::try_from(p).unwrap().to_le_bytes())
    });
    assert_eq!(
        open(&looped).err().as_deref(),
        Some("reader.ispd.bdb_corrupt")
    );
    let short = patched(b.clone(), |v| {
        v[p * size + 22..p * size + 24].copy_from_slice(&10u16.to_le_bytes())
    });
    assert_eq!(
        open(&short).err().as_deref(),
        Some("reader.ispd.bdb_corrupt")
    );
    let tight = Limits {
        max_chain: 1,
        ..Limits::STANDARD
    };
    let e = ispd::open(&b, &tight, &Options::default()).unwrap_err();
    assert_eq!(e.key, "reader.limit_exceeded");
    let small = Limits {
        max_bytes: 20_000,
        ..Limits::STANDARD
    };
    assert_eq!(
        ispd::open(&b, &small, &Options::default()).unwrap_err().key,
        "reader.limit_exceeded"
    );
}

#[test]
fn hostile_lengths_are_bounded() {
    let b = base();
    // Every offpage item announces an absurd total length.
    let mut v = b.clone();
    for p in 1..v.len() / 4096 {
        let page = &mut v[p * 4096..(p + 1) * 4096];
        if page[25] != 2 {
            continue;
        }
        let entries = usize::from(u16::from_le_bytes([page[20], page[21]]));
        for i in 0..entries {
            let o = usize::from(u16::from_le_bytes([page[26 + 2 * i], page[27 + 2 * i]]));
            if page[o] == 3 {
                page[o + 8..o + 12].copy_from_slice(&0xffff_fff0u32.to_le_bytes());
            }
        }
    }
    assert!(open(&v).is_err());
}

#[test]
fn byte_mutations_never_panic() {
    let b = base();
    let mut state = 7u64;
    let mut next = move || {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        usize::try_from(state >> 33).unwrap_or(0)
    };
    let limits = Limits {
        max_points: 5000,
        max_bytes: 1 << 20,
        ..Limits::STANDARD
    };
    for round in 0..400 {
        let mut v = b.clone();
        for _ in 0..=round % 5 {
            let i = next() % v.len();
            v[i] = u8::try_from(next() % 256).unwrap_or(0);
        }
        match ispd::open(&v, &limits, &Options::default()) {
            Ok(d) => assert!(!d.spectra.is_empty()),
            Err(e) => assert!(e.key.starts_with("reader."), "{}", e.key),
        }
    }
}
