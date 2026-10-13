//! Peak index (`peak-index/1`) on synthetic spectra with known bands: build, single and combined queries, tolerances,
//! absences, ordering, parity with the linear search and the stored form.
use ftir_core::peak_index::query::{parse_query, Absent, Query, Want};
use ftir_core::peak_index::{PeakIndex, MIN_PROMINENCE_REL};
use ftir_core::peaks::{Thresholds, CHAIN_ID};
use ftir_core::spectrum::Spectrum;
use ftir_core::synthetic::{generate, Band, Params};

/// (center, half width, height) per band.
type Bands = &'static [(f64, f64, f64)];

fn spectrum(bands: Bands) -> Spectrum {
    generate(&Params {
        from_cm1: 4000.0,
        to_cm1: 400.0,
        step_cm1: 2.0,
        bands: bands
            .iter()
            .map(|(c, w, h)| Band {
                center_cm1: *c,
                half_width_cm1: *w,
                height: *h,
            })
            .collect(),
        baseline_offset: 0.02,
        baseline_slope: 0.04,
        noise: 0.0005,
        seed: 3,
    })
}

const LIBRARY: [Bands; 4] = [
    &[(1712.0, 8.0, 1.0), (1275.0, 6.0, 0.6), (1000.0, 10.0, 0.3)],
    &[(1708.0, 8.0, 0.8), (1450.0, 10.0, 0.9), (3350.0, 40.0, 0.5)],
    &[(1730.0, 8.0, 1.0), (1275.0, 6.0, 0.9)],
    &[(1650.0, 30.0, 1.0), (1000.0, 10.0, 0.5)],
];

fn tol() -> ftir_core::peaks::thresholds::Tolerances {
    Thresholds::embedded().expect("thresholds").tolerances
}

fn index() -> PeakIndex {
    let spectra: Vec<Spectrum> = LIBRARY.iter().map(|b| spectrum(b)).collect();
    PeakIndex::build(&spectra, &Thresholds::embedded().expect("thresholds"))
}

fn want(pos: f64) -> Want {
    Want {
        position_cm1: pos,
        tolerance_cm1: None,
    }
}

fn query(wanted: Vec<Want>, absent: Vec<Absent>) -> Query {
    Query {
        wanted,
        absent,
        min_found: None,
        limit: 100,
    }
}

fn spectra_of(index: &PeakIndex, q: &Query) -> Vec<u32> {
    index
        .query(q, &tol())
        .expect("query")
        .hits
        .iter()
        .map(|h| h.spectrum)
        .collect()
}

#[test]
fn rows_are_sorted_small_and_one_per_band() {
    let i = index();
    assert_eq!(i.spectra(), 4);
    assert!(i.rows().windows(2).all(|w| w[0].pos10 <= w[1].pos10));
    assert!(i
        .rows()
        .iter()
        .all(|r| r.prominence_rel() >= MIN_PROMINENCE_REL - 1.0 / 255.0));
    let of = |s: u32| i.rows().iter().filter(|r| r.spectrum == s).count();
    assert_eq!((of(0), of(1), of(2), of(3)), (3, 3, 2, 2));
    assert_eq!(
        i.to_bytes("v1").len(),
        4 + i.header_json("v1").len() + 10 * 8
    );
}

#[test]
fn one_band_with_the_default_tolerance_of_its_width_class() {
    let i = index();
    // 1712 ± 6 narrow: spectra 0 (1712) and 1 (1708), not 2 (1730).
    assert_eq!(
        spectra_of(&i, &query(vec![want(1712.0)], vec![])),
        vec![0, 1]
    );
    // Broad band at 1650: ±15 reaches 1640 but not 1630.
    assert_eq!(spectra_of(&i, &query(vec![want(1637.0)], vec![])), vec![3]);
    assert!(spectra_of(&i, &query(vec![want(1630.0)], vec![])).is_empty());
    // An explicit tolerance replaces the class one.
    let wide = Want {
        position_cm1: 1712.0,
        tolerance_cm1: Some(20.0),
    };
    let mut wide_hits = spectra_of(&i, &query(vec![wide], vec![]));
    wide_hits.sort_unstable();
    assert_eq!(wide_hits, vec![0, 1, 2]);
    let tight = Want {
        position_cm1: 1712.0,
        tolerance_cm1: Some(2.0),
    };
    assert_eq!(spectra_of(&i, &query(vec![tight], vec![])), vec![0]);
}

#[test]
fn several_bands_are_anded_and_absences_exclude() {
    let i = index();
    let both = query(vec![want(1712.0), want(1275.0)], vec![]);
    assert_eq!(spectra_of(&i, &both), vec![0]);
    // "Nothing above 3300": spectrum 1 has its O-H band there.
    let none_above = Absent {
        from_cm1: 3300.0,
        to_cm1: 4000.0,
        min_prominence_rel: MIN_PROMINENCE_REL,
    };
    assert_eq!(
        spectra_of(&i, &query(vec![want(1712.0)], vec![none_above])),
        vec![0]
    );
    // A band under the prominence asked for does not count as present.
    let strong_only = Absent {
        from_cm1: 3300.0,
        to_cm1: 4000.0,
        min_prominence_rel: 0.9,
    };
    assert_eq!(
        spectra_of(&i, &query(vec![want(1712.0)], vec![strong_only])),
        vec![0, 1]
    );
}

#[test]
fn partial_matches_are_ranked_after_the_complete_ones() {
    let i = index();
    let mut q = query(vec![want(1712.0), want(1275.0), want(1000.0)], vec![]);
    assert_eq!(i.query(&q, &tol()).expect("query").required, 3);
    assert_eq!(spectra_of(&i, &q), vec![0]);
    q.min_found = Some(1);
    let r = i.query(&q, &tol()).expect("query");
    assert_eq!(r.total, 4);
    assert_eq!((r.hits[0].spectrum, r.hits[0].found.len()), (0, 3));
    let strength = |h: &ftir_core::peak_index::query::Hit| {
        h.found
            .iter()
            .map(|f| u32::from(f.row.prominence))
            .sum::<u32>()
    };
    assert!(r
        .hits
        .windows(2)
        .all(|w| (w[0].found.len(), strength(&w[0])) >= (w[1].found.len(), strength(&w[1]))));
}

#[test]
fn equal_counts_rank_by_prominence_then_distance() {
    let i = index();
    // Both 0 and 1 have a band within 6 of 1710: spectrum 0 has the stronger one (relative prominence 1.0 against 0.89).
    let r = i
        .query(&query(vec![want(1710.0)], vec![]), &tol())
        .expect("query");
    let order: Vec<u32> = r.hits.iter().map(|h| h.spectrum).collect();
    assert_eq!(order, vec![0, 1]);
    assert!(r.hits[0].found[0].delta_cm1 > 0.0);
}

#[test]
fn bad_queries_are_errors_as_data() {
    let i = index();
    for q in [
        query(vec![], vec![]),
        query(vec![want(f64::NAN)], vec![]),
        query(
            vec![Want {
                position_cm1: 1700.0,
                tolerance_cm1: Some(0.0),
            }],
            vec![],
        ),
        query(
            vec![want(1700.0)],
            vec![Absent {
                from_cm1: 3000.0,
                to_cm1: 2000.0,
                min_prominence_rel: 0.05,
            }],
        ),
    ] {
        let e = i.query(&q, &tol()).expect_err("must fail");
        assert_eq!(e.error_key, "peak_index.query_invalid");
    }
    assert!(parse_query("{\"peaks\":[{}]}").is_err());
    assert!(parse_query("not json").is_err());
    let q = parse_query("{\"peaks\":[{\"position_cm1\":1712}],\"absent\":[{\"from_cm1\":3300,\"to_cm1\":4000}],\"min_found\":1}").expect("parse");
    assert_eq!(
        (q.wanted.len(), q.absent.len(), q.min_found, q.limit),
        (1, 1, Some(1), 200)
    );
}

/// Deterministic pseudo-random numbers (no dependency).
fn lcg(state: &mut u64) -> f64 {
    *state = state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    (*state >> 33) as f64 / (1u64 << 31) as f64
}

#[test]
fn bisection_agrees_with_the_linear_search() {
    let i = index();
    let mut s = 42u64;
    for _ in 0..300 {
        let n = 1 + (lcg(&mut s) * 3.0) as usize;
        let wanted = (0..n)
            .map(|_| Want {
                position_cm1: 700.0 + lcg(&mut s) * 3200.0,
                tolerance_cm1: (lcg(&mut s) < 0.3).then(|| 1.0 + lcg(&mut s) * 40.0),
            })
            .collect();
        let from = 700.0 + lcg(&mut s) * 3000.0;
        let absent = if lcg(&mut s) < 0.5 {
            vec![Absent {
                from_cm1: from,
                to_cm1: from + lcg(&mut s) * 300.0,
                min_prominence_rel: 0.05,
            }]
        } else {
            vec![]
        };
        let mut q = query(wanted, absent);
        q.min_found = (lcg(&mut s) < 0.5).then_some(1);
        assert_eq!(
            i.query(&q, &tol()).expect("fast"),
            i.query_linear(&q, &tol()).expect("linear"),
            "{q:?}"
        );
    }
}

#[test]
fn an_unusable_spectrum_keeps_its_place() {
    let t = Thresholds::embedded().expect("thresholds");
    let tiny = Spectrum::new(
        ftir_core::spectrum::Role::Reference,
        ftir_core::spectrum::YUnit::Absorbance,
        vec![1000.0, 1001.0],
        vec![0.1, 0.2],
    );
    let good = spectrum(LIBRARY[0]);
    let i = PeakIndex::build(&[tiny, good], &t);
    assert_eq!(i.spectra(), 2);
    assert!(i.rows().iter().all(|r| r.spectrum == 1));
}

#[test]
fn stored_form_round_trips_and_refuses_other_versions() {
    let i = index();
    let t = Thresholds::embedded().expect("thresholds");
    let bytes = i.to_bytes("v1");
    assert_eq!(
        PeakIndex::from_bytes(&bytes, CHAIN_ID, t.version, "v1").expect("read"),
        i
    );
    let older =
        PeakIndex::from_bytes(&bytes, CHAIN_ID, t.version, "v2").expect_err("library changed");
    assert_eq!(older.error_key, "peak_index.obsolete");
    let other = PeakIndex::from_bytes(&bytes, CHAIN_ID, t.version + 1, "v1")
        .expect_err("thresholds changed");
    assert_eq!(other.error_key, "peak_index.obsolete");
    for cut in [0, 3, 10, bytes.len() - 1] {
        let e =
            PeakIndex::from_bytes(&bytes[..cut], CHAIN_ID, t.version, "v1").expect_err("truncated");
        assert_eq!(e.error_key, "peak_index.damaged", "cut {cut}");
    }
    // Rows out of order are refused: the bisection would silently miss bands.
    let mut swapped = bytes.clone();
    let head = 4 + i.header_json("v1").len();
    let (a, b) = (head, head + 8);
    for k in 0..8 {
        swapped.swap(a + k, b + k + 8 * 8);
    }
    assert!(PeakIndex::from_bytes(&swapped, CHAIN_ID, t.version, "v1").is_err());
}

#[test]
fn header_has_the_fields_of_the_schema_example() {
    let example =
        std::fs::read_to_string("../../tests/fixture/schemi/peak-index/valid/community.json")
            .expect("fixture");
    let keys = |text: &str| match ftir_core::passi::json::parse(text).expect("json") {
        ftir_core::passi::json::Value::Obj(o) => o
            .into_iter()
            .map(|(k, _)| k)
            .collect::<std::collections::BTreeSet<_>>(),
        other => panic!("not an object: {other:?}"),
    };
    assert_eq!(keys(&index().header_json("v1")), keys(&example));
}
