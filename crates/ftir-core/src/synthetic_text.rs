//! Writes synthetic delimited-text exports (CSV/TXT/ASC) from a synthetic spectrum, in every separator/decimal combination.
use crate::synthetic::{generate, Params};

/// Layout of one rendered file.
#[derive(Debug, Clone)]
pub struct Layout<'a> {
    pub sep: char,
    pub decimal: char,
    pub header: &'a [&'a str],
    pub newline: &'a str,
}

impl Default for Layout<'_> {
    fn default() -> Self {
        Layout {
            sep: ',',
            decimal: '.',
            header: &[],
            newline: "\r\n",
        }
    }
}

/// The x grid and absorbance of the demo spectrum, thinned to `every`-th point and rounded to 6 decimals
/// (so that every layout prints exactly the same numbers).
pub fn demo_columns(every: usize) -> (Vec<f64>, Vec<f64>) {
    let s = generate(&Params::demo());
    let r6 = |v: f64| (v * 1e6).round() / 1e6;
    let x = s
        .wavenumber_cm1
        .iter()
        .step_by(every)
        .map(|v| r6(*v))
        .collect();
    let y = s.y.iter().step_by(every).map(|v| r6(*v)).collect();
    (x, y)
}

fn num(v: f64, decimal: char) -> String {
    let t = format!("{v:.6}");
    if decimal == '.' {
        t
    } else {
        t.replace('.', &decimal.to_string())
    }
}

/// Header lines, then one row per point: x and one column per entry of `ys`.
pub fn render(x: &[f64], ys: &[&[f64]], l: &Layout) -> String {
    let mut out = String::new();
    for h in l.header {
        out += h;
        out += l.newline;
    }
    let sep = l.sep.to_string();
    for (i, xv) in x.iter().enumerate() {
        let mut cells = vec![num(*xv, l.decimal)];
        for y in ys {
            cells.push(num(y.get(i).copied().unwrap_or(0.0), l.decimal));
        }
        out += &cells.join(&sep);
        out += l.newline;
    }
    out
}

/// Y-only body (one value per line), as in an ASC export.
pub fn render_values(y: &[f64], header: &[&str], newline: &str) -> String {
    let mut out = String::new();
    for h in header {
        out += &format!("{h}{newline}");
    }
    for v in y {
        out += &format!("{v:.6}{newline}");
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn layouts_print_the_same_numbers() {
        let (x, y) = demo_columns(100);
        let a = render(&x, &[&y], &Layout::default());
        let l = Layout {
            sep: ';',
            decimal: ',',
            ..Layout::default()
        };
        assert_eq!(
            a.replace('.', ",").replace(',', ";").len(),
            render(&x, &[&y], &l).len()
        );
        assert!(a.starts_with("4000.000000,"));
    }
}
