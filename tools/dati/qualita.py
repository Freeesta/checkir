"""Quality metrics of a spectrum (ARCHITETTO_DATI_2 §8) computed from the JCAMP data; thresholds are provisional.

Each check returns (criterion, result, value) with result in pass / warning / fail. The same function writes `quality` in the
generator and verifies it in the data checker, so the stored values can never drift from the file.
"""
from __future__ import annotations

import math

from jcamp import Jcamp


def _region(j: Jcamp, lo: float, hi: float) -> tuple[list[float], list[float]]:
    pts = [(x, y) for x, y in zip(j.xs, j.ys) if lo <= x <= hi]
    return [p[0] for p in pts], [p[1] for p in pts]


def _detrended(xs: list[float], ys: list[float]) -> list[float]:
    """Residual of ys after a straight line through the two ends of the region."""
    if len(xs) < 3:
        return [0.0] * len(ys)
    slope = (ys[-1] - ys[0]) / (xs[-1] - xs[0])
    return [y - (ys[0] + slope * (x - xs[0])) for x, y in zip(xs, ys)]


def _point_noise(ys: list[float]) -> float:
    """RMS noise from second differences (white noise of sigma gives sigma): broad real bands, such as the N-H+ stretches
    of amine salts in 2500-2600 cm-1, do not count as noise."""
    d = [(ys[i - 1] - 2 * ys[i] + ys[i + 1]) / math.sqrt(6) for i in range(1, len(ys) - 1)]
    return math.sqrt(sum(v * v for v in d) / len(d)) if d else 0.0


def _flat_run(ys: list[float], peak: float) -> int:
    run = best = 0
    for y in ys:
        run = run + 1 if y >= peak * 0.999 else 0
        best = max(best, run)
    return best


def checks(j: Jcamp, meta: dict) -> list[tuple[str, str, float | None]]:
    xs, ys = j.xs, j.ys
    lo, hi = min(xs), max(xs)
    peak = max(ys)
    out: list[tuple[str, str, float | None]] = []
    out.append(("range", "pass" if lo <= 650 and hi >= 3600 else "fail", None))
    step = abs(xs[1] - xs[0])
    out.append(("resolution", "pass" if meta["resolution_cm1"] <= 4 and step <= 2 else "fail", meta["resolution_cm1"]))
    scans = meta.get("scans")
    out.append(("scans", "pass" if scans is not None and scans >= 16 else "warning", scans))
    out.append(("saturation", "fail" if peak > 1.5 or _flat_run(ys, peak) >= 3 else "pass", round(peak, 3)))
    out.append(("signal", "fail" if peak < 0.05 else "warning" if peak < 0.1 else "pass", round(peak, 3)))
    _, ny = _region(j, 2500, 2600)
    rms = _point_noise(ny)
    snr = peak / rms if rms > 0 else float("inf")
    out.append(("noise", "fail" if snr < 30 else "warning" if snr < 100 else "pass", None if math.isinf(snr) else round(snr, 1)))
    cx, cy = _region(j, 2300, 2380)
    co2 = max(_detrended(cx, cy), default=0.0) / peak if peak > 0 else 0.0
    out.append(("co2", "warning" if co2 >= 0.05 else "pass", round(co2, 4)))
    return out


def correlation(a: list[float], b: list[float]) -> float:
    """Pearson correlation of two equal-length series."""
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va, vb = sum((x - ma) ** 2 for x in a), sum((y - mb) ** 2 for y in b)
    return cov / math.sqrt(va * vb) if va > 0 and vb > 0 else 0.0
