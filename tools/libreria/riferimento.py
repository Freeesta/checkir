"""Reference values for the library resampling (crates/ftir-lib), computed with NumPy.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy):

    python3 tools/libreria/riferimento.py            # rewrites crates/ftir-lib/tests/golden/resample.json
    python3 tools/libreria/riferimento.py --versioni # prints the NumPy version used

Each case is a JCAMP-DX text written here with a fixed seed (axis as in real instruments: descending, a step that is
not the grid step, a range that does not cover the grid) and the expected absorbance on the grid 650-3800 step 2
computed with `numpy.interp` (NaN where the grid is outside the measured range, written as null). The Rust test feeds
the text to the engine and compares with a relative tolerance of 1e-9.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent.parent / "crates" / "ftir-lib" / "tests" / "golden" / "resample.json"
GRID = 650.0 + 2.0 * np.arange(1576)


def bands(x: np.ndarray, rng: np.random.RandomState) -> np.ndarray:
    y = 0.02 + 0.00004 * (x - x.min())
    for c, w, h in ((1050.0, 12.0, 0.8), (1250.0, 9.0, 0.5), (1600.0, 15.0, 0.6), (2900.0, 20.0, 0.3)):
        y = y + h / (1.0 + ((x - c) / w) ** 2)
    return y + 0.002 * rng.standard_normal(x.size)


def jcamp(x: np.ndarray, y: np.ndarray, yunits: str) -> str:
    lines = ["##TITLE=golden", "##JCAMP-DX=5.01", "##DATA TYPE=INFRARED SPECTRUM", "##XUNITS=1/CM", f"##YUNITS={yunits}",
             f"##FIRSTX={float(x[0])!r}", f"##LASTX={float(x[-1])!r}", f"##NPOINTS={x.size}", "##XYPOINTS=(XY..XY)"]
    lines += [f"{float(a)!r}, {float(b)!r}" for a, b in zip(x, y)]
    return "\n".join(lines + ["##END=", ""])


def interp(x: np.ndarray, y: np.ndarray) -> list:
    order = np.argsort(x)
    out = np.interp(GRID, x[order], y[order], left=np.nan, right=np.nan)
    return [None if not np.isfinite(v) else float(v) for v in out]


def cases() -> list:
    rng = np.random.RandomState(20261013)
    out = []
    x = 3600.7 - 1.93 * np.arange(1506)             # descending, RESPONSE-like step, starts inside the grid
    y = bands(x, rng)
    out.append({"name": "descending_1.93", "jdx": jcamp(x, y, "ABSORBANCE"), "expected": interp(x, y)})
    x = 500.0 + 1.03 * np.arange(3300)              # ascending, BCCSU-like step, covers the whole grid
    y = bands(x, rng)
    out.append({"name": "ascending_1.03_wide", "jdx": jcamp(x, y, "ABSORBANCE"), "expected": interp(x, y)})
    x = 3700.0 - 4.0 * np.arange(700)               # transmittance in percent, step 4, ends at 904
    t = 100.0 * 10.0 ** (-bands(x, rng))
    out.append({"name": "transmittance_percent", "jdx": jcamp(x, t, "TRANSMITTANCE"), "expected": interp(x, -np.log10(t / 100.0))})
    return out


def main() -> None:
    if "--versioni" in sys.argv:
        print("numpy", np.__version__)
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases()}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
