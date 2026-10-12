//! Writes synthetic JCAMP-DX files (every form the reader supports, plus broken ones) with the truth known.
//!
//! The files are built from `synthetic` spectra, never copied from real data. `fixtures()` is the single source of the
//! files in `tests/fixtures/jcamp/`: the example `gen_jcamp_fixtures` writes them and a test checks they are current.
use crate::synthetic::{true_value, Params};

/// The truth of one spectrum of a fixture.
#[derive(Debug, Clone, PartialEq)]
pub struct Truth {
    pub x: Vec<f64>,
    pub y_int: Vec<i64>,
    pub yfactor: f64,
    /// `true` for XYPOINTS and PEAK TABLE (explicit x), `false` for a regular axis.
    pub explicit: bool,
}

/// A synthetic file with what the reader must find.
#[derive(Debug, Clone, PartialEq)]
pub struct Fixture {
    pub name: &'static str,
    pub bytes: Vec<u8>,
    pub spectra: Vec<Truth>,
    /// Warning keys the reader must report (sorted, unique; spectrum and document level together).
    pub warnings: Vec<&'static str>,
    /// Whether the python `jcamp` library can read the file (golden values are generated for these).
    pub oracle: bool,
}

const YF: f64 = 1e-6;
const PER_LINE: usize = 10;

fn grid(from: f64, step: f64, n: usize) -> Vec<f64> {
    let r4 = |v: f64| (v * 1e4).round() / 1e4;
    (0..n).map(|i| r4(from + step * i as f64)).collect()
}

fn quantised(x: &[f64]) -> Vec<i64> {
    let p = Params::demo();
    x.iter()
        .map(|&v| (true_value(&p, v) / YF).round() as i64)
        .collect()
}

fn truth(x: Vec<f64>) -> Truth {
    let y_int = quantised(&x);
    Truth {
        x,
        y_int,
        yfactor: YF,
        explicit: false,
    }
}

/// Header up to (not including) the table label.
fn header(title: &str, version: &str, t: &Truth, npoints: usize) -> String {
    let first = t.x.first().copied().unwrap_or(0.0);
    let last = t.x.last().copied().unwrap_or(0.0);
    let n = t.x.len().max(2) as f64 - 1.0;
    let ys: Vec<f64> = t.y_int.iter().map(|&v| v as f64 * t.yfactor).collect();
    let min = ys.iter().copied().fold(f64::INFINITY, f64::min);
    let max = ys.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    format!(
        "##TITLE={title}\r\n##JCAMP-DX={version}\r\n##DATA TYPE=INFRARED SPECTRUM\r\n##ORIGIN=synthetic generator\r\n\
         ##OWNER=checkir tests\r\n##XUNITS=1/CM\r\n##YUNITS=ABSORBANCE\r\n##XFACTOR=1\r\n##YFACTOR=1E-6\r\n\
         ##FIRSTX={first:.4}\r\n##LASTX={last:.4}\r\n##DELTAX={:.4}\r\n##NPOINTS={npoints}\r\n##FIRSTY={:.6}\r\n\
         ##MINY={min:.6}\r\n##MAXY={max:.6}\r\n",
        (last - first) / n,
        ys.first().copied().unwrap_or(0.0)
    )
}

fn digits_code(v: u64, lead_chars: &[u8; 10]) -> String {
    let s = v.to_string();
    let mut chars = s.chars();
    let lead = chars.next().and_then(|c| c.to_digit(10)).unwrap_or(0) as usize;
    let mut out = String::new();
    out.push(char::from(lead_chars.get(lead).copied().unwrap_or(b'@')));
    out.extend(chars);
    out
}

const SQZ_POS: [u8; 10] = *b"@ABCDEFGHI";
const SQZ_NEG: [u8; 10] = *b"@abcdefghi";
const DIF_POS: [u8; 10] = *b"%JKLMNOPQR";
const DIF_NEG: [u8; 10] = *b"%jklmnopqr";
const DUP: [u8; 10] = *b"@STUVWXYZs";

fn sqz(v: i64) -> String {
    digits_code(v.unsigned_abs(), if v < 0 { &SQZ_NEG } else { &SQZ_POS })
}

fn dif(v: i64) -> String {
    digits_code(v.unsigned_abs(), if v < 0 { &DIF_NEG } else { &DIF_POS })
}

fn dup(n: usize) -> String {
    digits_code(n as u64, &DUP)
}

fn table_affn(t: &Truth, pac: bool, round_x: bool) -> String {
    let mut out = String::new();
    for (r, chunk) in t.y_int.chunks(PER_LINE).enumerate() {
        let x = t.x.get(r * PER_LINE).copied().unwrap_or(0.0);
        out += &if round_x {
            format!("{}", x.round())
        } else {
            format!("{x:.4}")
        };
        for v in chunk {
            if pac {
                out += &format!("{v:+}");
            } else {
                out += &format!(" {v}");
            }
        }
        out += "\r\n";
    }
    out
}

fn table_sqz(t: &Truth) -> String {
    let mut out = String::new();
    for (r, chunk) in t.y_int.chunks(PER_LINE).enumerate() {
        out += &format!("{:.4}", t.x.get(r * PER_LINE).copied().unwrap_or(0.0));
        for v in chunk {
            out += &sqz(*v);
        }
        out += "\r\n";
    }
    out
}

/// DIF form with DUP for repeated differences; each line after the first starts with the check value.
/// `corrupt` is the line index whose check value is made wrong.
fn table_dif(t: &Truth, corrupt: Option<usize>) -> String {
    let mut out = String::new();
    let mut prev: Option<i64> = None;
    for (r, chunk) in t.y_int.chunks(PER_LINE).enumerate() {
        let idx = r * PER_LINE;
        let x = match prev {
            Some(_) => t.x.get(idx.saturating_sub(1)),
            None => t.x.first(),
        };
        out += &format!("{:.4}", x.copied().unwrap_or(0.0));
        let mut last = prev;
        let mut toks: Vec<String> = Vec::new();
        if let Some(p) = prev {
            toks.push(sqz(p + i64::from(corrupt == Some(r))));
        }
        for v in chunk {
            toks.push(match last {
                Some(l) => dif(v - l),
                None => sqz(*v),
            });
            last = Some(*v);
        }
        out += &compress_runs(&toks);
        out += "\r\n";
        prev = last;
    }
    out
}

fn compress_runs(toks: &[String]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < toks.len() {
        let mut j = i + 1;
        while toks.get(j) == toks.get(i) {
            j += 1;
        }
        out += toks.get(i).map_or("", String::as_str);
        if j - i > 1 {
            out += &dup(j - i);
        }
        i = j;
    }
    out
}

fn file(
    name: &'static str,
    head: String,
    table: String,
    t: Truth,
    warnings: &[&'static str],
) -> Fixture {
    let text = format!("{head}##XYDATA=(X++(Y..Y))\r\n{table}##END=\r\n");
    Fixture {
        name,
        bytes: text.into_bytes(),
        spectra: vec![t],
        warnings: warnings.to_vec(),
        oracle: true,
    }
}

fn points_fixture(name: &'static str, peaks: bool) -> Fixture {
    let x = vec![3300.5, 2920.25, 1715.0, 1450.75, 1100.5];
    let mut t = truth(x);
    t.explicit = true;
    let (label, form) = if peaks {
        ("PEAK TABLE", "(XYW..XYW)")
    } else {
        ("XYPOINTS", "(XY..XY)")
    };
    let mut text = header("Synthetic points", "4.24", &t, t.x.len());
    text += &format!("##{label}={form}\r\n");
    let cells: Vec<String> =
        t.x.iter()
            .zip(&t.y_int)
            .map(|(x, y)| {
                if peaks {
                    format!("{x},{y},5.5")
                } else {
                    format!("{x},{y}")
                }
            })
            .collect();
    text += &format!("{}\r\n##END=\r\n", cells.join("; "));
    Fixture {
        name,
        bytes: text.into_bytes(),
        spectra: vec![t],
        warnings: if peaks {
            vec!["reader.jcamp.peaks_only"]
        } else {
            vec![]
        },
        oracle: false,
    }
}

fn link_fixture() -> Fixture {
    let a = truth(grid(4000.0, -20.0, 40));
    let b = truth(grid(1800.0, -10.0, 30));
    let one = |title, t: &Truth| {
        let head = header(title, "4.24", t, t.x.len());
        format!(
            "{head}##XYDATA=(X++(Y..Y))\r\n{}##END=\r\n",
            table_affn(t, false, false)
        )
    };
    let text = format!(
        "##TITLE=Synthetic link\r\n##JCAMP-DX=4.24\r\n##DATA TYPE=LINK\r\n##BLOCKS=2\r\n{}{}##END=\r\n",
        one("Block one", &a),
        one("Block two", &b)
    );
    Fixture {
        name: "link_two_blocks",
        bytes: text.into_bytes(),
        spectra: vec![a, b],
        warnings: vec![],
        oracle: false,
    }
}

/// All fixtures, in a fixed order.
pub fn fixtures() -> Vec<Fixture> {
    let desc = truth(grid(3996.5492, -19.1, 180));
    let asc = truth(grid(400.0, 20.0, 181));
    let mut out = Vec::new();
    let h = |t: &Truth, v: &str| header("Synthetic", v, t, t.x.len());
    out.push(file(
        "affn_ascending",
        h(&asc, "5.01"),
        table_affn(&asc, false, false),
        asc.clone(),
        &[],
    ));
    out.push(file(
        "pac_descending_rounded",
        h(&desc, "4.24"),
        table_affn(&desc, true, true),
        desc.clone(),
        &[],
    ));
    out.push(file(
        "sqz",
        h(&desc, "4.24"),
        table_sqz(&desc),
        desc.clone(),
        &[],
    ));
    out.push(file(
        "dif_dup",
        h(&desc, "4.24"),
        table_dif(&desc, None),
        desc.clone(),
        &[],
    ));
    let bad = file(
        "dif_bad_check",
        h(&desc, "4.24"),
        table_dif(&desc, Some(3)),
        desc.clone(),
        &["reader.jcamp.y_check"],
    );
    out.push(Fixture {
        oracle: false,
        ..bad
    });
    let head = header("Synthetic", "4.24", &desc, desc.x.len() + 3);
    let wrong = file(
        "npoints_wrong",
        head,
        table_affn(&desc, false, false),
        desc.clone(),
        &["reader.jcamp.npoints_mismatch"],
    );
    out.push(Fixture {
        oracle: false,
        ..wrong
    });
    out.push(points_fixture("xypoints", false));
    out.push(points_fixture("peak_table", true));
    out.push(link_fixture());
    out.extend(odd_fixtures(&asc));
    out
}

/// Encoding, unknown label and missing end.
fn odd_fixtures(asc: &Truth) -> Vec<Fixture> {
    let body = table_affn(asc, false, false);
    let head = header("Synthetic", "5.01", asc, asc.x.len());
    let mut cp = format!(
        "{head}##SAMPLE DESCRIPTION=A\u{B1}B sample\r\n##XYDATA=(X++(Y..Y))\r\n{body}##END=\r\n"
    );
    let latin: Vec<u8> = cp
        .chars()
        .map(|c| u8::try_from(u32::from(c)).unwrap_or(b'?'))
        .collect();
    cp.clear();
    let unknown = format!(
        "{head}##$PRIVATE LABEL=kept\r\n##VENDOR EXTENSION=also kept\r\n##XYDATA=(X++(Y..Y))\r\n{body}##END=\r\n"
    );
    let no_end = format!("{head}##XYDATA=(X++(Y..Y))\r\n{body}");
    let make = |name, bytes: Vec<u8>, w: &[&'static str]| Fixture {
        name,
        bytes,
        spectra: vec![asc.clone()],
        warnings: w.to_vec(),
        oracle: false,
    };
    vec![
        make("windows1252", latin, &["reader.encoding_fallback"]),
        make(
            "unknown_label",
            unknown.into_bytes(),
            &["reader.fields_unknown"],
        ),
        make(
            "end_missing",
            no_end.into_bytes(),
            &["reader.jcamp.end_missing"],
        ),
    ]
}

fn list<T: ToString>(v: &[T]) -> String {
    v.iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

/// Truth as JSON text (deterministic).
pub fn truth_json(f: &Fixture) -> String {
    let spectra: Vec<String> = f
        .spectra
        .iter()
        .map(|t| {
            format!(
                "{{\"explicit_x\":{},\"x\":[{}],\"y_int\":[{}],\"yfactor\":{:e}}}",
                t.explicit,
                list(&t.x),
                list(&t.y_int),
                t.yfactor
            )
        })
        .collect();
    let warnings: Vec<String> = f.warnings.iter().map(|w| format!("\"{w}\"")).collect();
    format!(
        "{{\"name\":\"{}\",\"oracle\":{},\"warnings\":[{}],\"spectra\":[{}]}}\n",
        f.name,
        f.oracle,
        warnings.join(","),
        spectra.join(",")
    )
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn codes() {
        assert_eq!(sqz(0), "@");
        assert_eq!(sqz(123), "A23");
        assert_eq!(sqz(-45), "d5");
        assert_eq!(dif(0), "%");
        assert_eq!(dif(-7), "p");
        assert_eq!(dup(2), "T");
        assert_eq!(dup(12), "S2");
    }

    #[test]
    fn fixtures_are_deterministic_and_named_once() {
        let a = fixtures();
        assert_eq!(a, fixtures());
        let mut names: Vec<_> = a.iter().map(|f| f.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), a.len());
    }
}
