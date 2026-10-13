//! The report of the library test: histogram of the best wrong r, how many wrong matches the current thresholds would
//! call "probable" (the number to keep at zero), the spectral twins, the forms each substance has, and a CSV of ids and
//! names for the review. Never spectral data. The wrong matches are counted with the thresholds as they are now.
use super::indice::Index;
use super::opzioni::parse_options;
use super::prova::Prova;
use super::risultato::Level;
use super::soglie::Thresholds;
use crate::error::EngineResult;
use crate::passi::json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// Twins at or above this r are very probably the same material under two labels (the weaker tier is `twin_r`).
pub const TWIN_STRONG_R: f64 = 0.98;
/// Histogram of the best wrong r: bins of this width from 0 to 1 (below 0 is counted apart).
pub const BIN_WIDTH: f64 = 0.05;
/// Rows listed in the report for the probable wrong matches and the twins (the CSV has them all).
pub const LIST_MAX: usize = 200;

/// One wrong match or twin pair: global rows and r.
struct Pair {
    a: usize,
    b: usize,
    r: f64,
}

fn num(x: usize) -> Value {
    Value::Num(x as f64)
}

fn text(s: &str) -> Value {
    Value::Str(s.to_string())
}

fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Obj(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn row_value(index: &Index, g: usize) -> Value {
    let (li, _) = index.locate(g);
    let e = index.entry(g);
    obj(vec![
        ("id", text(&e.id)),
        ("display_name", text(&e.display_name)),
        ("form", text(&e.form)),
        ("library", text(&index.libs[li].id)),
    ])
}

fn pair_value(index: &Index, p: &Pair) -> Value {
    obj(vec![
        ("a", row_value(index, p.a)),
        ("b", row_value(index, p.b)),
        ("r", Value::Num(p.r)),
    ])
}

/// Probable wrong matches (r₁ and margin as in the real search, full range, full coverage) and to-check ones.
fn wrong_levels(p: &Prova, t: &Thresholds) -> EngineResult<(Vec<Pair>, usize)> {
    let o = parse_options("", t)?;
    let (mut probable, mut to_check) = (Vec::new(), 0);
    for k in 0..p.done {
        let margin = (p.r2[k] > -1.0).then(|| p.r1[k] - p.r2[k]);
        match super::livello::propose(p.r1[k], margin, 1.0, false, &o, t).0 {
            Level::Probable => probable.push(Pair {
                a: p.rows[k],
                b: p.partner[k] as usize,
                r: p.r1[k],
            }),
            Level::ToCheck => to_check += 1,
            Level::NotIdentified => {}
        }
    }
    Ok((probable, to_check))
}

/// Twin pairs (different substances) with r at or above `min`, each pair once, strongest first.
fn twin_pairs(p: &Prova, min: f64) -> Vec<Pair> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for k in 0..p.done {
        if p.partner[k] == u32::MAX || p.r1[k] < min {
            continue;
        }
        let (a, b) = (p.rows[k], p.partner[k] as usize);
        if seen.insert((a.min(b), a.max(b))) {
            out.push(Pair { a, b, r: p.r1[k] });
        }
    }
    out.sort_by(|x, y| y.r.total_cmp(&x.r).then(x.a.cmp(&y.a)));
    out
}

fn histogram(p: &Prova) -> Value {
    let bins = (1.0 / BIN_WIDTH).round() as usize;
    let (mut counts, mut below) = (vec![0usize; bins], 0usize);
    for k in 0..p.done {
        if p.partner[k] == u32::MAX {
            continue;
        }
        if p.r1[k] < 0.0 {
            below += 1;
        } else {
            counts[((p.r1[k] / BIN_WIDTH) as usize).min(bins - 1)] += 1;
        }
    }
    obj(vec![
        ("from", Value::Num(0.0)),
        ("width", Value::Num(BIN_WIDTH)),
        ("below", num(below)),
        ("counts", Value::Arr(counts.into_iter().map(num).collect())),
    ])
}

/// Is a form name the free base? (the rest, when named, are salts, hydrates or other forms)
fn is_base(form: &str) -> bool {
    let f: String = form
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();
    matches!(f.as_str(), "base" | "freebase" | "basefree" | "neutral")
}

/// Per library: substances, and how many have only a base form, only salt (or other) forms, both, or no form named.
fn coverage(index: &Index, p: &Prova) -> Value {
    let mut libs: BTreeMap<usize, BTreeMap<u32, (bool, bool, bool)>> = BTreeMap::new();
    for &g in &p.rows {
        let (li, _) = index.locate(g);
        let f = &index.entry(g).form;
        let slot = libs
            .entry(li)
            .or_default()
            .entry(index.group[g])
            .or_default();
        match (f.trim().is_empty(), is_base(f)) {
            (true, _) => slot.2 = true,
            (false, true) => slot.0 = true,
            (false, false) => slot.1 = true,
        }
    }
    let list = libs.into_iter().map(|(li, subs)| {
        let c = |f: fn(&(bool, bool, bool)) -> bool| subs.values().filter(|s| f(s)).count();
        obj(vec![
            ("library", text(&index.libs[li].id)),
            ("substances", num(subs.len())),
            ("base_only", num(c(|s| s.0 && !s.1))),
            ("salt_only", num(c(|s| s.1 && !s.0))),
            ("both", num(c(|s| s.0 && s.1))),
            ("no_form", num(c(|s| s.2 && !s.0 && !s.1))),
        ])
    });
    Value::Arr(list.collect())
}

/// JSON `prova-libreria/1`: progress, thresholds in use, histogram, wrong "probable" matches, twins and coverage.
pub fn report(index: &Index, p: &Prova, t: &Thresholds) -> EngineResult<String> {
    let (probable, to_check) = wrong_levels(p, t)?;
    let weak = twin_pairs(p, t.twin_r);
    let strong = weak.iter().filter(|x| x.r >= TWIN_STRONG_R).count();
    let list = |v: &[Pair]| {
        Value::Arr(
            v.iter()
                .take(LIST_MAX)
                .map(|x| pair_value(index, x))
                .collect(),
        )
    };
    Ok(obj(vec![
        ("schema", text("prova-libreria/1")),
        ("done", num(p.done)),
        ("total", num(p.total())),
        ("complete", Value::Bool(p.done == p.total())),
        (
            "grouping",
            text(&format!("{:?}", index.grouping).to_lowercase()),
        ),
        ("probable_r1", Value::Num(t.probable_r1)),
        ("probable_margin", Value::Num(t.probable_margin)),
        ("check_r1", Value::Num(t.check_r1)),
        ("twin_r", Value::Num(t.twin_r)),
        ("twin_strong_r", Value::Num(TWIN_STRONG_R)),
        ("histogram", histogram(p)),
        ("probable_wrong", num(probable.len())),
        ("to_check_wrong", num(to_check)),
        ("probable_wrong_list", list(&probable)),
        ("twins_weak", num(weak.len() - strong)),
        ("twins_strong", num(strong)),
        ("twins_list", list(&weak)),
        ("coverage", coverage(index, p)),
    ])
    .write())
}

fn field(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// CSV for the review (decimal point): kind, r, then library, id, name and form of both spectra. Ids and names only.
pub fn csv(index: &Index, p: &Prova, t: &Thresholds) -> EngineResult<String> {
    let mut out =
        String::from("kind,r,library_a,id_a,name_a,form_a,library_b,id_b,name_b,form_b\n");
    let (probable, _) = wrong_levels(p, t)?;
    let mut add = |kind: &str, x: &Pair| {
        let side = |g: usize| {
            let (li, _) = index.locate(g);
            let e = index.entry(g);
            [index.libs[li].id.as_str(), &e.id, &e.display_name, &e.form]
                .map(field)
                .join(",")
        };
        out.push_str(&format!("{kind},{:.4},{},{}\n", x.r, side(x.a), side(x.b)));
    };
    probable.iter().for_each(|x| add("probable_wrong", x));
    for x in twin_pairs(p, t.twin_r) {
        add(
            if x.r >= TWIN_STRONG_R {
                "twin_strong"
            } else {
                "twin"
            },
            &x,
        );
    }
    Ok(out)
}
