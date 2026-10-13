"""Reference values for the peak finder (crates/ftir-core/src/peaks/find.rs), computed with SciPy.

Regenerate by hand when a case is added (NOT part of the mandatory CI; needs numpy and scipy):

    python3 tools/picchi_riferimento.py             # rewrites crates/ftir-core/tests/fixture/peaks/parity.json
    python3 tools/picchi_riferimento.py --versioni  # prints the library versions used

Each case stores its input (already on the grid, no absent points) and the expected output of
`find_peaks(prominence, distance)`, then the local prominence rule (`peak_prominences` with `wlen`), then `peak_widths`
at `rel_height`. The Rust test needs no Python and compares indices exactly and widths with a relative tolerance of 1e-9.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy
from scipy.signal import find_peaks, peak_prominences, peak_widths

OUT = Path(__file__).resolve().parent.parent / "crates" / "ftir-core" / "tests" / "fixture" / "peaks" / "parity.json"
STEP = 2.0
WLEN = 30  # 60 cm-1 on the grid of 2 cm-1


def bands(x: np.ndarray, spec: list[tuple[float, float, float]]) -> np.ndarray:
    y = np.zeros_like(x)
    for c, w, h in spec:
        y = y + h / (1.0 + ((x - c) / w) ** 2)
    return y


def case(name: str, y: np.ndarray, min_prominence: float, local_min: float, distance: int = 2, rel_height: float = 0.5) -> dict:
    peaks, _ = find_peaks(y, prominence=min_prominence, distance=distance)
    local = peak_prominences(y, peaks, wlen=WLEN)[0]
    peaks = peaks[local >= local_min]
    prom, left_base, right_base = peak_prominences(y, peaks)
    widths, heights, left_ips, right_ips = peak_widths(y, peaks, rel_height=rel_height, prominence_data=(prom, left_base, right_base))
    return {
        "name": name,
        "y": [float(v) for v in y],
        "min_prominence": min_prominence,
        "local_min": local_min,
        "wlen": WLEN,
        "distance": distance,
        "rel_height": rel_height,
        "expected": {
            "indices": [int(v) for v in peaks],
            "prominences": [float(v) for v in prom],
            "left_bases": [int(v) for v in left_base],
            "right_bases": [int(v) for v in right_base],
            "widths": [float(v) for v in widths],
            "width_heights": [float(v) for v in heights],
            "left_ips": [float(v) for v in left_ips],
            "right_ips": [float(v) for v in right_ips],
        },
    }


def cases() -> list[dict]:
    x = 650.0 + STEP * np.arange(1576)
    spec = [(3000.0, 20.0, 0.3), (2920.0, 12.0, 0.25), (1700.0, 8.0, 1.0), (1685.0, 7.0, 0.3), (1450.0, 10.0, 0.5),
            (1250.0, 6.0, 0.4), (1000.0, 12.0, 0.7), (800.0, 9.0, 0.35)]
    out = []
    for name, noise, seed in (("quiet", 0.0005, 11), ("noisy", 0.004, 12), ("very_noisy", 0.02, 13)):
        rng = np.random.RandomState(seed)
        y = bands(x, spec) + 0.02 + noise * rng.standard_normal(x.size)
        out.append(case(name, y, max(5 * noise, 0.02), 5 * noise))
    rng = np.random.RandomState(14)
    y = np.round(bands(x, spec) + 0.002 * rng.standard_normal(x.size), 2)  # coarse values make flat tops
    out.append(case("flat_tops", y, 0.02, 0.01))
    rng = np.random.RandomState(15)
    y = bands(x, spec) + 0.0005 * rng.standard_normal(x.size)
    out.append(case("distance_3", y, 0.02, 0.0, distance=3))
    out.append(case("rel_height_075", y, 0.02, 0.0, rel_height=0.75))
    return out


def main(argv: list[str]) -> int:
    if argv == ["--versioni"]:
        print(f"numpy {np.__version__}, scipy {scipy.__version__}")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = {"function": "scipy.signal.find_peaks(prominence, distance) + peak_prominences(wlen) + peak_widths(rel_height)",
           "step_cm1": STEP, "cases": cases()}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {sum(len(c['expected']['indices']) for c in doc['cases'])} peaks)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
