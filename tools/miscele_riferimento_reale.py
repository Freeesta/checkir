"""Exports a fixed subset of the private mixture bench (seed 11) for `crates/ftir-core/tests/miscele_real.rs`.

Needs the private repository (env CHECKIR_DATA, default /home/user/checkir-data) with the bench in
`studio/esperimenti/matematica` and its `cache_grid.npz` (run its `build_cache.py` first). It imports the bench
code at runtime and writes `studio/miscele/miscele_reale_seme11.json` INSIDE the private repository: the file holds
library spectra and must never be committed here. Per mixture it stores the sample (raw absorbance on the grid),
the candidate indices (top 25 of the bench ranking + cuts) and the components chosen by the bench rule
(`forward_abs` with the single-active rule). Usage: python3 -I tools/miscele_riferimento_reale.py
"""
import json
import os
import sys

import numpy as np

DATA = os.environ.get('CHECKIR_DATA', '/home/user/checkir-data')
BENCH = os.path.join(DATA, 'studio', 'esperimenti', 'matematica')
sys.path.insert(0, BENCH)
import bench_mix as B  # noqa: E402
import common as C  # noqa: E402
from bench_id import base_corrected, load  # noqa: E402

SEED = 11
FRACTIONS = (0.2, 0.3, 0.5)
ACTIVES_PER_FRACTION = 4
PURES = 4
GAIN = 0.02  # stop_variance_share of soglie_miscele/1 (the bench default is 0.01)


def main():
    files, libs, Y, keys, forms, names = load()
    lname = np.array([n.lower() for n in names])
    Ya = np.clip(base_corrected(Y, 'asls'), 0, None)
    Ya = Ya / Ya[:, B.KEEP].sum(1, keepdims=True)
    D = B.deriv(Ya)[:, B.KEEP]
    Dc = D - D.mean(1, keepdims=True)
    Dc /= np.linalg.norm(Dc, axis=1, keepdims=True)

    def find(namelist):
        out = {}
        for nm in namelist:
            idx = np.where(lname == nm)[0]
            if len(idx) and len(set(libs[keys == keys[idx[0]]])) >= 2:
                out[keys[idx[0]]] = nm
        return out
    act, cut = find(B.ACTIVE_NAMES), find(B.CUT_NAMES)
    rng = np.random.default_rng(SEED)
    used, mixtures = {}, []

    def run(q, src, truth, label):
        cidx = np.where(libs != src)[0]
        s = B.pearson_vec(B.prep_query(q), Dc[cidx])
        top = list(cidx[np.argsort(-s)[:25]])
        cuts_idx = [i for i in cidx if keys[i] in cut]
        cand = list(dict.fromkeys(top + cuts_idx))
        cutset = set(cuts_idx)
        sel = B.forward_abs(q[B.KEEP], Ya[:, B.KEEP], cand, gain=GAIN, is_cut=lambda k: k in cutset)
        for i in cand:
            used.setdefault(int(i), len(used))
        mixtures.append({
            'label': label, 'truth': [t for t, _ in truth],
            'sample_y': [float(v) for v in q],
            'candidates': [used[int(i)] for i in cand],
            'cut_candidates': [used[int(i)] for i in cuts_idx],
            'expected': [{'candidate': used[int(i)], 'weight': float(w)} for i, w in sel],
        })

    act_keys, cut_keys = list(act), list(cut)
    for k in act_keys[:PURES]:
        i = int(np.where(keys == k)[0][0])
        run(Ya[i] + rng.normal(0, 0.003 * Ya[i].max(), len(C.G)), libs[i], [(k, 'active')], f'pure {act[k]}')
    for f in FRACTIONS:
        for ak in act_keys[:ACTIVES_PER_FRACTION]:
            ck = cut_keys[rng.integers(len(cut_keys))]
            srcs = sorted(set(libs[keys == ak]) & set(libs[keys == ck]))
            if not srcs:
                continue
            src = srcs[rng.integers(len(srcs))]
            ia = rng.choice(np.where((keys == ak) & (libs == src))[0])
            ic = rng.choice(np.where((keys == ck) & (libs == src))[0])
            other = libs != src
            if not ((keys[other] == ak).any() and (keys[other] == ck).any()):
                continue
            q = (1 - f) * Ya[ia] + f * Ya[ic]
            xx = (C.G - C.G.mean()) / (np.ptp(C.G) / 2)
            drift = rng.uniform(-1, 1, 3) @ np.array([xx, xx ** 2, xx ** 3]) * 0.2 * q.max()
            q = q + drift + rng.normal(0, 0.003 * q.max(), len(C.G))
            run(q, src, [(ak, 'active'), (ck, 'cut')], f'{act[ak]} + {cut[ck]} cut {f}')
    library = [None] * len(used)
    for i, j in used.items():
        library[j] = {'id': str(files[i]), 'substance': str(keys[i]), 'name': str(names[i]),
                      'library': str(libs[i]), 'y': [float(v) for v in Y[i]]}
    out = {'schema': 'miscele-reale-seme11/1', 'wavenumber_cm1': [float(v) for v in C.G],
           'library': library, 'mixtures': mixtures}
    path = os.path.join(DATA, 'studio', 'miscele')
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'miscele_reale_seme11.json'), 'w') as fo:
        json.dump(out, fo)
    print(len(mixtures), 'mixtures,', len(library), 'library spectra')


if __name__ == '__main__':
    main()
