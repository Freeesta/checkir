//! Maxima, prominences and widths, written to give the same answers as `scipy.signal.find_peaks`,
//! `peak_prominences` and `peak_widths` (parity fixtures in `tests/fixture/peaks/`, made by `tools/picchi_riferimento.py`).
//! All indices are positions in the slice given; the caller cuts the spectrum into runs of present points.

/// A maximum with the facts scipy computes for it.
#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub index: usize,
    pub prominence: f64,
    pub left_base: usize,
    pub right_base: usize,
    /// Width at `rel_height` of the prominence, in samples (interpolated).
    pub width: f64,
    /// Where the width line crosses the signal, in samples (interpolated).
    pub left_ip: f64,
    pub right_ip: f64,
    /// Height of the width line.
    pub width_height: f64,
}

/// Local maxima; a flat top gives its middle (rounded down), edges are never maxima (`_local_maxima_1d`).
pub fn local_maxima(y: &[f64]) -> Vec<usize> {
    let mut out = Vec::new();
    if y.len() < 3 {
        return out;
    }
    let last = y.len() - 1;
    let mut i = 1;
    while i < last {
        if y[i - 1] < y[i] {
            let mut ahead = i + 1;
            while ahead < last && y[ahead] == y[i] {
                ahead += 1;
            }
            if y[ahead] < y[i] {
                out.push((i + ahead - 1) / 2);
                i = ahead;
            }
        }
        i += 1;
    }
    out
}

/// Keeps the highest of any group of maxima closer than `distance` samples (`_select_by_peak_distance`).
pub fn select_by_distance(y: &[f64], peaks: &[usize], distance: usize) -> Vec<usize> {
    let mut keep = vec![true; peaks.len()];
    let mut order: Vec<usize> = (0..peaks.len()).collect();
    order.sort_by(|a, b| y[peaks[*a]].total_cmp(&y[peaks[*b]]));
    for &j in order.iter().rev() {
        if !keep[j] {
            continue;
        }
        let mut k = j;
        while k > 0 && peaks[j] - peaks[k - 1] < distance {
            k -= 1;
            keep[k] = false;
        }
        k = j + 1;
        while k < peaks.len() && peaks[k] - peaks[j] < distance {
            keep[k] = false;
            k += 1;
        }
    }
    peaks
        .iter()
        .zip(&keep)
        .filter_map(|(p, k)| k.then_some(*p))
        .collect()
}

/// Prominence and bases of a maximum; `wlen` (samples) limits the search to a window around it (`peak_prominences`).
pub fn prominence(y: &[f64], peak: usize, wlen: Option<usize>) -> (f64, usize, usize) {
    let (mut lo, mut hi) = (0, y.len() - 1);
    if let Some(w) = wlen.filter(|w| *w >= 2) {
        lo = peak.saturating_sub(w / 2);
        hi = (peak + w / 2).min(y.len() - 1);
    }
    let (mut left_min, mut left_base, mut i) = (y[peak], peak, peak);
    loop {
        if y[i] > y[peak] {
            break;
        }
        if y[i] < left_min {
            left_min = y[i];
            left_base = i;
        }
        if i == lo {
            break;
        }
        i -= 1;
    }
    let (mut right_min, mut right_base, mut i) = (y[peak], peak, peak);
    while i <= hi && y[i] <= y[peak] {
        if y[i] < right_min {
            right_min = y[i];
            right_base = i;
        }
        i += 1;
    }
    (y[peak] - left_min.max(right_min), left_base, right_base)
}

/// Width at `rel_height` of the prominence, between the bases (`peak_widths`).
pub fn width(
    y: &[f64],
    peak: usize,
    prom: (f64, usize, usize),
    rel_height: f64,
) -> (f64, f64, f64, f64) {
    let height = y[peak] - prom.0 * rel_height;
    let mut i = peak;
    while prom.1 < i && height < y[i] {
        i -= 1;
    }
    let mut left = i as f64;
    if y[i] < height {
        left += (height - y[i]) / (y[i + 1] - y[i]);
    }
    let mut i = peak;
    while i < prom.2 && height < y[i] {
        i += 1;
    }
    let mut right = i as f64;
    if y[i] < height {
        right -= (height - y[i]) / (y[i - 1] - y[i]);
    }
    (right - left, left, right, height)
}

/// Every maximum with prominence ≥ `min_prominence` after the distance filter, in the order of scipy's `find_peaks`
/// (maxima → distance → prominence); widths use the full prominence (no window).
pub fn find_peaks(y: &[f64], min_prominence: f64, distance: usize, rel_height: f64) -> Vec<Found> {
    let maxima = select_by_distance(y, &local_maxima(y), distance);
    maxima
        .into_iter()
        .filter_map(|index| {
            let prom = prominence(y, index, None);
            (prom.0 >= min_prominence).then(|| {
                let (w, left_ip, right_ip, width_height) = width(y, index, prom, rel_height);
                Found {
                    index,
                    prominence: prom.0,
                    left_base: prom.1,
                    right_base: prom.2,
                    width: w,
                    left_ip,
                    right_ip,
                    width_height,
                }
            })
        })
        .collect()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn maxima_flat_tops_and_edges() {
        assert_eq!(
            local_maxima(&[0.0, 1.0, 0.0, 2.0, 2.0, 2.0, 0.0, 3.0]),
            vec![1, 4]
        );
        assert_eq!(local_maxima(&[1.0, 2.0, 3.0]), Vec::<usize>::new());
    }

    #[test]
    fn prominence_and_width_of_a_triangle() {
        let y = [0.0, 1.0, 2.0, 3.0, 2.0, 1.0, 0.0];
        let p = prominence(&y, 3, None);
        assert_eq!(p, (3.0, 0, 6));
        let (w, l, r, h) = width(&y, 3, p, 0.5);
        assert_eq!((w, l, r, h), (3.0, 1.5, 4.5, 1.5));
    }

    #[test]
    fn distance_keeps_the_higher_maximum() {
        let y = [0.0, 3.0, 0.0, 4.0, 0.0, 1.0, 0.0];
        assert_eq!(select_by_distance(&y, &[1, 3, 5], 3), vec![3]);
        assert_eq!(select_by_distance(&y, &[1, 3, 5], 2), vec![1, 3, 5]);
    }

    #[test]
    fn a_window_limits_the_prominence() {
        let y = [5.0, 0.0, 0.5, 1.0, 0.5, 0.0, 5.0];
        assert_eq!(prominence(&y, 3, None).0, 1.0);
        assert!((prominence(&y, 3, Some(2)).0 - 0.5).abs() < 1e-12);
    }
}
