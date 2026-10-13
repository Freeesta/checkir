"""Reference values for the library comparison (crates/ftir-core/src/confronti/), computed with NumPy, SciPy and pybaselines.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy, scipy and pybaselines):

    python3 tools/confronti_riferimento.py            # rewrites crates/ftir-core/tests/golden/confronti/*.json
    python3 tools/confronti_riferimento.py --versioni # prints the library versions used

Inputs are made here with a fixed seed (rounded to 6 decimals, so Python and Rust read the same numbers) and stored with
the expected output: the Rust tests need no Python. The comparison is the one of the chain `confronto_v1` (grid 650-3800
step 2, Savitzky-Golay 15/3 first derivative, mask 1900-2400) and `pearson_spettro` (AsLS lam 1e7, p 0.01, 50 iterations).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import savgol_filter

OUT = Path(__file__).resolve().parent.parent / "crates" / "ftir-core" / "tests" / "golden" / "confronti"
G = 650.0 + 2.0 * np.arange(1576)
MASK = (G >= 1900.0) & (G <= 2400.0)
RANGES = {"narrow": [[1000.0, 1800.0]], "two": [[700.0, 1200.0], [2800.0, 3100.0]], "all": [[650.0, 3800.0]]}


def clean(a):
    return [None if not np.isfinite(v) else float(v) for v in np.asarray(a, dtype=float)]


def spectrum(x, rng, bands):
    y = 0.02 + 0.00004 * (x - x.min())
    for c, w, h in bands:
        y = y + h / (1.0 + ((x - c) / w) ** 2)
    return np.round(y + 0.001 * rng.standard_normal(x.size), 6)


def to_grid(x, y):
    o = np.argsort(x)
    return np.interp(G, x[o], y[o])


def derivative(g):
    d = savgol_filter(g, 15, 3, deriv=1, delta=2.0, mode="interp")
    d[MASK] = np.nan
    return d


def corrected(g):
    from pybaselines import Baseline
    z = Baseline(G).asls(g, lam=1e7, p=0.01, max_iter=50, tol=1e-3)[0]
    c = g - z
    c[MASK] = np.nan
    return c


def pearson(a, b, sel):
    ok = np.isfinite(a) & np.isfinite(b) & sel
    x, y = a[ok] - a[ok].mean(), b[ok] - b[ok].mean()
    return float((x @ y) / np.sqrt((x @ x) * (y @ y)))


def sel_of(ranges):
    sel = np.zeros(G.size, dtype=bool)
    for lo, hi in ranges:
        sel |= (G >= lo) & (G <= hi)
    return sel & ~MASK


def library_case() -> dict:
    rng = np.random.RandomState(20261014)
    x = 4000.0 - 4.0 * np.arange(851)  # descending, 4000-600
    families = [
        [(1050, 12, 0.8), (1250, 9, 0.5), (1600, 15, 0.6), (2900, 20, 0.3)],
        [(1050, 12, 0.7), (1262, 9, 0.5), (1600, 15, 0.5), (2900, 20, 0.35)],
        [(900, 10, 0.6), (1450, 14, 0.7), (1720, 12, 0.9), (3050, 25, 0.2)],
        [(700, 10, 0.5), (1150, 11, 0.8), (1500, 13, 0.6), (3300, 30, 0.3)],
        [(1000, 12, 0.9), (1350, 10, 0.4), (1650, 16, 0.5), (2850, 15, 0.5)],
        [(800, 9, 0.4), (1100, 10, 0.5), (1700, 14, 0.6), (3000, 20, 0.6)],
    ]
    lib = [spectrum(x, rng, b) for b in families]
    query = spectrum(x, rng, [(1052, 12, 0.8), (1251, 9, 0.5), (1598, 15, 0.6), (2902, 20, 0.3)])
    gd = [derivative(to_grid(x, y)) for y in lib]
    gs = [corrected(to_grid(x, y)) for y in lib]
    qd, qs = derivative(to_grid(x, query)), corrected(to_grid(x, query))
    out = {"x": clean(x), "library": [clean(y) for y in lib], "query": clean(query), "expected": {}}
    for name, ranges in RANGES.items():
        sel = sel_of(ranges)
        out["expected"][name] = {
            "ranges": ranges,
            "r_derivative": [pearson(qd, d, sel) for d in gd],
            "r_spectrum": [pearson(qs, s, sel) for s in gs],
        }
    return out


def asls_case() -> dict:
    rng = np.random.RandomState(5)
    cases = []
    for k in range(3):
        y = spectrum(G, rng, [(1000 + 100 * k, 12, 0.8), (1600, 15, 0.6), (2900, 20, 0.3)]) + 0.05 * k * np.sin(G / 400.0)
        from pybaselines import Baseline
        z = Baseline(G).asls(y, lam=1e7, p=0.01, max_iter=50, tol=1e-3)[0]
        cases.append({"y": clean(y), "expected": clean(z)})
    return {"function": "pybaselines.Baseline.asls(lam=1e7, p=0.01, max_iter=50, tol=1e-3)", "cases": cases}


def main() -> None:
    if "--versioni" in sys.argv:
        import pybaselines
        import scipy
        print("numpy", np.__version__, "scipy", scipy.__version__, "pybaselines", pybaselines.__version__)
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for name, doc in (("asls", asls_case()), ("libreria", library_case())):
        (OUT / f"{name}.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8")
        print("wrote", OUT / f"{name}.json")


if __name__ == "__main__":
    main()
