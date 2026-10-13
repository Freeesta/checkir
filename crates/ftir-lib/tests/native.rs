//! The reference as the file gives it (`native_record`): same points, same order, no smoothing and no resampling; a
//! transmittance file is only converted to absorbance. The real check on Ketamine HCl of the private repository is
//! skipped without `CHECKIR_DATA`.
use ftir_lib::build::native_record;
use std::path::PathBuf;

fn jcamp(header: &str, rows: &[(f64, f64)]) -> Vec<u8> {
    let mut s = format!("##TITLE=t\n##JCAMP-DX=4.24\n##DATA TYPE=INFRARED SPECTRUM\n##XUNITS=1/CM\n{header}\n##XFACTOR=1\n##YFACTOR=1\n##NPOINTS={}\n##XYPOINTS=(XY..XY)\n", rows.len());
    for (x, y) in rows {
        s.push_str(&format!("{x}, {y}\n"));
    }
    s.push_str("##END=\n");
    s.into_bytes()
}

fn parts(r: &[f32]) -> (usize, f32, &[f32], &[f32]) {
    let n = r[0] as usize;
    (n, r[1], &r[2..2 + n], &r[2 + n..2 + 2 * n])
}

#[test]
fn an_irregular_absorbance_file_keeps_its_own_points_and_order() {
    let rows = [
        (1800.5, 0.1),
        (1500.25, 0.9),
        (1499.0, 0.4),
        (700.125, 0.05),
    ];
    let jdx = jcamp("##YUNITS=ABSORBANCE\n##RESOLUTION=4", &rows);
    let r = native_record(&jdx).expect("record");
    let (n, resolution, x, y) = parts(&r);
    assert_eq!((n, resolution, r.len()), (4, 4.0, 2 + 8));
    for (i, (xi, yi)) in rows.iter().enumerate() {
        assert_eq!((x[i], y[i]), (*xi as f32, *yi as f32), "point {i}");
    }
}

#[test]
fn a_file_without_resolution_says_nan_and_transmittance_is_only_converted() {
    let rows = [(1000.0, 100.0), (1001.5, 10.0), (1003.0, 1.0)];
    let r = native_record(&jcamp("##YUNITS=TRANSMITTANCE", &rows)).expect("record");
    let (n, resolution, x, y) = parts(&r);
    assert!(resolution.is_nan() && n == 3);
    assert_eq!(x, [1000.0, 1001.5, 1003.0]);
    for (got, want) in y.iter().zip([0.0, 1.0, 2.0]) {
        assert!((got - want).abs() < 1e-5, "{got} {want}");
    }
}

#[test]
fn a_file_that_is_not_a_spectrum_is_an_error() {
    assert!(native_record(b"nope").is_err());
}

/// Independent reading of an AFFN `##XYDATA=(X++(Y..Y))` block: the y values of every line after its first column.
fn ys_of(text: &str, factor: f64) -> Vec<f64> {
    text.lines()
        .skip_while(|l| !l.starts_with("##XYDATA"))
        .skip(1)
        .take_while(|l| !l.starts_with("##"))
        .flat_map(|l| {
            l.split_whitespace()
                .skip(1)
                .map(|v| v.parse::<f64>().expect("number"))
        })
        .map(|v| v * factor)
        .collect()
}

fn header(text: &str, key: &str) -> f64 {
    let line = text.lines().find(|l| l.starts_with(key)).expect(key);
    line.split('=')
        .nth(1)
        .expect("value")
        .trim()
        .parse()
        .expect("number")
}

#[test]
fn ketamine_hcl_is_drawn_with_the_points_of_its_file() {
    let Some(dir) = std::env::var_os("CHECKIR_DATA")
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
    else {
        return;
    };
    let path = dir.join("Library/Ketamine HCl.DX");
    let Ok(bytes) = std::fs::read(&path) else {
        return;
    };
    let text = String::from_utf8_lossy(&bytes).to_string();
    let want_y = ys_of(&text, header(&text, "##YFACTOR"));
    let r = native_record(&bytes).expect("record");
    let (n, _, x, y) = parts(&r);
    assert_eq!(
        n,
        header(&text, "##NPOINTS") as usize,
        "the points of the file"
    );
    assert_eq!(n, want_y.len());
    let (first, last) = (header(&text, "##FIRSTX"), header(&text, "##LASTX"));
    for i in 0..n {
        let want_x = first + (last - first) * i as f64 / (n - 1) as f64;
        assert!(
            (f64::from(x[i]) - want_x).abs() < 2e-3,
            "x {i}: {} {want_x}",
            x[i]
        );
        assert!(
            (f64::from(y[i]) - want_y[i]).abs() <= 1e-6 * want_y[i].abs().max(1e-3),
            "y {i}: {} {}",
            y[i],
            want_y[i]
        );
    }
}
