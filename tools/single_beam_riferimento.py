"""Reference values for crates/ftir-core/src/single_beam, computed with NumPy (same recipe as the validated fft.py).

Regenerate by hand (NOT part of the mandatory CI; needs numpy):

    python3 tools/single_beam_riferimento.py     # rewrites crates/ftir-core/tests/golden/single_beam/parity.json

Each case: a synthetic two-sided interferogram (cosines under an envelope, offset, noise with a fixed seed) for the
sample and the background, the single channels (mean removed, triangle around the centre burst, roll, rfft, abs) and
the absorbance -log10(S/B) interpolated on a target axis with numpy.interp. The Rust test compares at 1e-9.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "crates/ftir-core/tests/golden/single_beam/parity.json"


def channel(ig: np.ndarray, dx: float):
    n = len(ig)
    ig = ig - ig.mean()
    c = int(np.argmax(np.abs(ig)))
    w = 1 - np.abs(np.arange(n) - c) / max(c, n - c)
    s = np.abs(np.fft.rfft(np.roll(ig * w, -c)))
    return np.fft.rfftfreq(n, dx), s, c


def interferogram(rng, n, dx, centre, lines):
    x = (np.arange(n) - centre) * dx
    y = np.zeros(n)
    for nu, amp, width in lines:
        y += amp * np.cos(2 * np.pi * nu * x) * np.exp(-((x * width) ** 2))
    return 3.0 + y + rng.normal(0, 0.002, n)


def case(name, n, dx, centre_s, centre_b, seed):
    rng = np.random.default_rng(seed)
    lines_b = [(1000.0, 1.0, 300.0), (2000.0, 0.8, 300.0), (3000.0, 0.6, 300.0)]
    lines_s = [(1000.0, 0.9, 300.0), (2000.0, 0.8, 300.0), (3000.0, 0.55, 300.0)]
    ig_s = interferogram(rng, n, dx, centre_s, lines_s)
    ig_b = interferogram(rng, n, dx, centre_b, lines_b)
    nu_s, s, cs = channel(ig_s, dx)
    nu_b, b, cb = channel(ig_b, dx)
    target = np.linspace(4000.0, 600.0, 400)
    a = -np.log10(np.interp(target, nu_s, s) / np.interp(target, nu_b, b))
    return {
        "name": name, "n": n, "step_cm": dx, "sample": ig_s.tolist(), "background": ig_b.tolist(),
        "centre_sample": cs, "centre_background": cb, "magnitude_sample": s.tolist(),
        "magnitude_background": b.tolist(), "target_cm1": target.tolist(), "absorbance": a.tolist(),
    }


def main():
    cases = [case("centred", 512, 1 / 15800.0 * 2, 256, 256, 11), case("off_centre", 1024, 1 / 15800.0, 150, 850, 12)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"numpy": np.__version__, "cases": cases}, separators=(",", ":")))
    print(OUT, OUT.stat().st_size, "bytes; numpy", np.__version__)


if __name__ == "__main__":
    main()
