//! Radix-2 complex FFT written for the project (no dependency). Forward uses exp(-2 pi i k n / N), unnormalised.

use crate::error::{EngineError, EngineResult};

fn check(re: &[f64], im: &[f64]) -> EngineResult<usize> {
    let n = re.len();
    if n != im.len() || n == 0 || !n.is_power_of_two() {
        return Err(EngineError::new(
            "didactic.fft_length",
            "the FFT length must be a power of two, equal for both parts",
        )
        .with_param("length", n));
    }
    Ok(n)
}

/// In-place forward FFT.
pub fn fft(re: &mut [f64], im: &mut [f64]) -> EngineResult<()> {
    let n = check(re, im)?;
    let shift = usize::BITS - n.trailing_zeros();
    for i in 0..n {
        let j = if n == 1 { 0 } else { i.reverse_bits() >> shift };
        if j > i {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let twiddles: Vec<(f64, f64)> = (0..n / 2)
        .map(|k| (-2.0 * std::f64::consts::PI * k as f64 / n as f64).sin_cos())
        .collect();
    let mut len = 2;
    while len <= n {
        let (half, step) = (len / 2, n / len);
        for start in (0..n).step_by(len) {
            for k in 0..half {
                let (s, c) = twiddles[k * step];
                let (a, b) = (start + k, start + k + half);
                let tr = re[b] * c - im[b] * s;
                let ti = re[b] * s + im[b] * c;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len *= 2;
    }
    Ok(())
}

/// In-place inverse FFT (normalised by 1/N).
pub fn ifft(re: &mut [f64], im: &mut [f64]) -> EngineResult<()> {
    let n = check(re, im)?;
    im.iter_mut().for_each(|v| *v = -*v);
    fft(re, im)?;
    let scale = 1.0 / n as f64;
    re.iter_mut().for_each(|v| *v *= scale);
    im.iter_mut().for_each(|v| *v *= -scale);
    Ok(())
}
