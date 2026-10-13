"""Reference values for the mixture search (crates/ftir-core/src/miscele/), computed with NumPy and SciPy.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy and scipy):

    python3 tools/miscele_riferimento.py            # rewrites crates/ftir-core/tests/golden/miscele/*.json
    python3 tools/miscele_riferimento.py --versioni # prints the library versions used

`nnls.json`: random problems solved by `scipy.optimize.nnls` (some with free-sign background columns written as the
pair c, -c, as the engine does). `selezione.json`: the forward selection with the rule of the single active, written
here from its description with `scipy.optimize.nnls` as the solver; the Rust test must pick the same candidates and
coefficients. The tests compare with 1e-9 (relative to the data scale).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import nnls

OUT = Path(__file__).resolve().parent.parent / "crates" / "ftir-core" / "tests" / "golden" / "miscele"
SEED = 20261013


def background(n: int, order: int) -> np.ndarray:
    x = np.linspace(-1.0, 1.0, n)
    pos = np.array([x ** p for p in range(order + 1)])
    return np.vstack([pos, -pos])


def nnls_cases() -> list[dict]:
    rng = np.random.RandomState(SEED)
    cases = []
    for n, k, order in ((60, 3, -1), (200, 5, -1), (300, 4, 3), (300, 6, 3), (150, 2, 1), (400, 8, 3)):
        x = np.linspace(0.0, 1.0, n)
        cols = []
        for _ in range(k):
            c, w = rng.uniform(0.1, 0.9), rng.uniform(0.02, 0.1)
            cols.append(np.exp(-0.5 * ((x - c) / w) ** 2) + 0.01 * rng.rand(n))
        a = np.array(cols)
        truth = rng.uniform(0.0, 2.0, k) * (rng.rand(k) > 0.4)
        b = truth @ a + 0.01 * rng.randn(n)
        if order >= 0:
            bg = background(n, order)
            b = b + rng.uniform(-0.3, 0.3, order + 1) @ bg[: order + 1]
            a = np.vstack([a, bg])
        w, rnorm = nnls(a.T, b)
        cases.append({"columns": a.tolist(), "b": b.tolist(), "x": w.tolist(), "rss": float(rnorm ** 2)})
    return cases


def forward(y, cols, is_cut, order, stop=0.02, second=0.10, max_k=3):
    """Forward selection, single-active rule; returns (picked indices, coefficients, total, rss)."""
    n = len(y)
    bg = background(n, order)

    def solve(sel):
        m = np.vstack([cols[sel], bg]) if sel else bg
        w, r = nnls(m.T, y)
        return w, r ** 2

    _, total = solve([])
    sel, res = [], total
    for _ in range(max_k):
        trials = [(solve(sel + [j]), j) for j in range(len(cols)) if j not in sel]
        if not trials:
            break
        (w, rss), j = min(trials, key=lambda t: (t[0][1], t[1]))
        second_active = (not is_cut[j]) and any(not is_cut[k] for k in sel)
        need = second if second_active else stop
        if (res - rss) / total < need:
            allowed = [t for t in trials if is_cut[t[1]] or all(is_cut[k] for k in sel)]
            if not allowed:
                break
            (w2, rss2), j2 = min(allowed, key=lambda t: (t[0][1], t[1]))
            if (res - rss2) / total >= stop and w2[len(sel)] > 0:
                w, rss, j = w2, rss2, j2
            else:
                break
        if w[len(sel)] <= 0:
            break
        sel.append(j)
        res = rss
    w, rss = solve(sel)
    return sel, w[: len(sel)].tolist(), total, rss


def selection_cases() -> list[dict]:
    rng = np.random.RandomState(SEED + 1)
    n = 260
    x = np.linspace(0.0, 1.0, n)

    def band(c, w):
        return np.exp(-0.5 * ((x - c) / w) ** 2)

    names = ["active-a", "active-b", "active-c", "cut-a", "cut-b", "cut-c"]
    centres = [(0.15, 0.03), (0.30, 0.025), (0.62, 0.03), (0.45, 0.04), (0.78, 0.02), (0.90, 0.03)]
    cols = np.array([band(c, w) / band(c, w).sum() for c, w in centres])
    is_cut = [False, False, False, True, True, True]
    cases = []
    mixes = {"pure_active": [1, 0, 0, 0, 0, 0], "active_and_cut": [0.7, 0, 0, 0.3, 0, 0],
             "two_cuts": [0, 0, 0, 0.4, 0.25, 0], "two_actives_weak": [0.8, 0.04, 0, 0, 0, 0],
             "two_actives_strong": [0.5, 0.5, 0, 0, 0, 0], "nothing": [0, 0, 0, 0, 0, 0]}
    for name, weights in mixes.items():
        y = np.array(weights) @ cols * 100.0 + 0.1 * np.linspace(-1, 1, n) + 0.002 * rng.randn(n) + 0.0
        picks, w, total, rss = forward(y, cols, is_cut, 3)
        cases.append({"name": name, "y": y.tolist(), "columns": cols.tolist(), "is_cut": is_cut,
                      "picks": picks, "weights": w, "total": total, "rss": rss})
    return cases


def main(argv: list[str]) -> int:
    if argv == ["--versioni"]:
        import scipy
        print(f"numpy {np.__version__}, scipy {scipy.__version__}")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "nnls.json").write_text(json.dumps({"cases": nnls_cases()}) + "\n", encoding="utf-8")
    (OUT / "selezione.json").write_text(json.dumps({"cases": selection_cases()}) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
