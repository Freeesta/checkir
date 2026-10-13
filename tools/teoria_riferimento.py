"""Reference values for the didactic engine (crates/ftir-core/src/didactic), computed with NumPy.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy):

    python3 tools/teoria_riferimento.py             # rewrites crates/ftir-core/tests/fixture/didactic/parity.json
    python3 tools/teoria_riferimento.py --versioni  # prints the library version used

`fft`: random complex inputs (fixed seed) and numpy.fft.fft. `spectrum`: a small two-sided interferogram, truncated,
apodized, wrapped (zero path difference at index 0), zero-filled, transformed with numpy.fft.rfft; same formulas as
`spectrum_from_interferogram`. The Rust test needs no Python and compares with a tolerance of 1e-9.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "crates" / "ftir-core" / "tests" / "fixture" / "didactic" / "parity.json"


def apod(name: str, u: np.ndarray) -> np.ndarray:
    if name == "boxcar":
        return np.ones_like(u)
    if name == "triangular":
        return 1.0 - u
    if name == "happ_genzel":
        return 0.54 + 0.46 * np.cos(np.pi * u)
    if name == "blackman_harris_3":
        return 0.42323 + 0.49755 * np.cos(np.pi * u) + 0.07922 * np.cos(2 * np.pi * u)
    raise ValueError(name)


def fft_cases(rng: np.random.Generator) -> list[dict]:
    cases = []
    for n in (1, 2, 8, 64, 256):
        z = rng.normal(size=n) + 1j * rng.normal(size=n)
        f = np.fft.fft(z)
        cases.append({"re": z.real.tolist(), "im": z.imag.tolist(), "fft_re": f.real.tolist(), "fft_im": f.imag.tolist()})
    return cases


def spectrum_case(rng: np.random.Generator, apodization: str, output: str, zero_fill: int) -> dict:
    half, step, opd_max_points = 20, 0.0005, 15
    n = 2 * half + 1
    ifg = rng.normal(size=n)
    j = np.arange(n)
    x = np.abs((j - half) * step)
    opd_max = opd_max_points * step
    keep = x <= opd_max * (1 + 1e-9)
    w = np.where(keep, apod(apodization, np.minimum(x / opd_max, 1.0)), 0.0)
    length = 1 << (n - 1).bit_length()
    length *= zero_fill
    buf = np.zeros(length)
    buf[(j + length - half) % length] = ifg * w
    s = np.fft.rfft(buf)
    scale = 2.0 / w[keep].sum()
    y = s.real if output == "real" else np.abs(s)
    return {
        "half_points": half, "step_cm": step, "opd_max_cm": opd_max, "apodization": apodization,
        "zero_fill": zero_fill, "output": output, "intensity": ifg.tolist(), "expected": (y * scale).tolist(),
    }


def main() -> None:
    if "--versioni" in sys.argv:
        print("numpy", np.__version__)
        return
    rng = np.random.default_rng(20261013)
    data = {
        "numpy": np.__version__,
        "fft": fft_cases(rng),
        "spectrum": [
            spectrum_case(rng, "boxcar", "real", 1),
            spectrum_case(rng, "triangular", "magnitude", 2),
            spectrum_case(rng, "happ_genzel", "real", 4),
            spectrum_case(rng, "blackman_harris_3", "magnitude", 1),
        ],
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print("wrote", OUT.relative_to(OUT.parents[5]))


if __name__ == "__main__":
    main()
