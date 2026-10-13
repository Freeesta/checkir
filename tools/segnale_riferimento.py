"""Reference values for the signal steps (crates/ftir-core/src/passi/), computed with NumPy and SciPy.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy and scipy):

    python3 tools/segnale_riferimento.py            # rewrites crates/ftir-core/tests/golden/segnale/*.json
    python3 tools/segnale_riferimento.py --versioni # prints the library versions used

Inputs are made here with a fixed seed and stored in the files together with the expected output, so the Rust tests
need no Python. An absent value (NaN) is written as null. The tests compare with a relative tolerance of 1e-9.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import savgol_filter

OUT = Path(__file__).resolve().parent.parent / "crates" / "ftir-core" / "tests" / "golden" / "segnale"


def clean(a):
    """JSON-ready list: NaN becomes null."""
    return [None if not np.isfinite(v) else float(v) for v in np.asarray(a, dtype=float)]


def spectrum(x: np.ndarray, rng: np.random.RandomState) -> np.ndarray:
    """A few Lorentz bands, a slope and noise."""
    y = 0.02 + 0.00005 * (x - x.min())
    for c, w, h in ((1050.0, 12.0, 0.8), (1250.0, 9.0, 0.5), (1600.0, 15.0, 0.6), (2900.0, 20.0, 0.3)):
        y = y + h / (1.0 + ((x - c) / w) ** 2)
    return y + 0.002 * rng.standard_normal(x.size)


def savgol_cases() -> dict:
    rng = np.random.RandomState(20261013)
    x = 650.0 + 2.0 * np.arange(200)
    y = spectrum(x, rng)
    cases = []
    for window, order, deriv in ((15, 3, 0), (15, 3, 1), (15, 3, 2), (11, 3, 1), (21, 3, 1), (9, 2, 2), (31, 3, 1), (5, 2, 0)):
        want = savgol_filter(y, window, order, deriv=deriv, delta=2.0, mode="interp")
        cases.append({"window": window, "polyorder": order, "deriv": deriv, "x": clean(x), "y": clean(y), "expected": clean(want)})
    xd = x[::-1]
    yd = y[::-1]
    want = savgol_filter(yd, 15, 3, deriv=1, delta=-2.0, mode="interp")
    cases.append({"window": 15, "polyorder": 3, "deriv": 1, "x": clean(xd), "y": clean(yd), "expected": clean(want)})
    return {"function": "scipy.signal.savgol_filter(mode='interp', delta=axis step)", "cases": cases}


def grid_cases() -> dict:
    rng = np.random.RandomState(7)
    x = np.sort(4000.0 - np.cumsum(1.93 + 0.1 * rng.rand(1500)))[::-1]  # descending, irregular step ~2 cm-1
    x = x[(x > 700.0) & (x < 2200.0)]
    y = spectrum(x, rng)
    cases = []
    for lo, hi, step in ((650.0, 3800.0, 2.0), (1000.0, 1200.0, 1.0), (900.0, 1000.5, 0.5)):
        g = np.arange(int(np.floor((hi - lo) / step + 1e-9)) + 1) * step + lo
        want = np.interp(g, x[::-1], y[::-1])
        want[(g < x.min()) | (g > x.max())] = np.nan
        cases.append({"from_cm1": lo, "to_cm1": hi, "step_cm1": step, "x": clean(x), "y": clean(y), "expected": clean(want)})
    return {"function": "numpy.interp, absent outside the measured range", "cases": cases}


def transmittance_cases() -> dict:
    t = np.array([100.0, 99.0, 75.5, 50.0, 10.0, 1.0, 0.01, 0.0, -3.0])
    with np.errstate(divide="ignore", invalid="ignore"):
        a = np.where(t > 0, -np.log10(np.where(t > 0, t, 1.0) / 100.0), np.nan)
    return {"function": "A = -log10(T/100); T <= 0 absent", "percent": clean(t), "expected": clean(a)}


def normalize_cases() -> dict:
    rng = np.random.RandomState(3)
    x = 650.0 + 2.0 * np.arange(120)
    y = spectrum(x, rng)
    return {
        "function": "vettore: y/||y||; snv: (y-mean)/std(ddof=1); minmax: (y-min)/(max-min)",
        "x": clean(x),
        "y": clean(y),
        "vettore": clean(y / np.linalg.norm(y)),
        "snv": clean((y - y.mean()) / y.std(ddof=1)),
        "minmax": clean((y - y.min()) / (y.max() - y.min())),
    }


def main() -> None:
    if "--versioni" in sys.argv:
        import scipy
        print("numpy", np.__version__, "scipy", scipy.__version__)
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for name, doc in (("savgol", savgol_cases()), ("griglia", grid_cases()), ("trasmittanza", transmittance_cases()), ("normalizza", normalize_cases())):
        (OUT / f"{name}.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8")
        print("wrote", OUT / f"{name}.json")


if __name__ == "__main__":
    main()
