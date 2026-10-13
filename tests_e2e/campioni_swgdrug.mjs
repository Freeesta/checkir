// Deterministic samples built from the public SWGDRUG spectra in data/substances/*/spectra/*.swgdrug.*.jdx: linear interpolation on a new grid,
// then (all optional) shift, scale, baseline slope, ATR factor, CO2 band, seeded noise; mixtures are weighted sums. No browser here.
import { readFileSync } from "node:fs";

const SUBSTANCES = new URL("../data/substances/", import.meta.url);

/** The 11 public spectra: [substance, spectrum id]. */
export const PURES = [
  ["caffeine", "caffeine-base.swgdrug.357"],
  ["paracetamol", "paracetamol-neutral.swgdrug.354"],
  ["phenacetin", "phenacetin-neutral.swgdrug.352"],
  ["levamisole", "levamisole-hcl.swgdrug.358"],
  ["procaine", "procaine-hcl.swgdrug.374"],
  ["benzocaine", "benzocaine-base.swgdrug.350"],
  ["lidocaine", "lidocaine-base.swgdrug.508"],
  ["lidocaine", "lidocaine-hcl-h2o.swgdrug.375"],
  ["lactose", "lactose-alpha.swgdrug.388"],
  ["mannitol", "mannitol-neutral.swgdrug.366"],
  ["inositol", "inositol-neutral.swgdrug.367"],
];

/** A tiny seeded generator (mulberry32): same seed, same numbers. @param {number} seed @returns {() => number} uniform in [0, 1) */
export function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal numbers from a uniform generator (Box-Muller). @param {() => number} u @returns {() => number} */
function gaussian(u) {
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
}

/** Read a public SWGDRUG spectrum (JCAMP XYPOINTS, ascending x). @param {string} substance @param {string} id @returns {{ x: number[], y: number[] }} */
export function readPure(substance, id) {
  const text = readFileSync(new URL(`${substance}/spectra/${id}.jdx`, SUBSTANCES), "utf8");
  const body = text.split(/##XYPOINTS=[^\n]*\n/)[1];
  const x = [];
  const y = [];
  for (const line of body.split("\n")) {
    const m = /^\s*([\d.]+),\s*([-\d.eE]+)\s*$/.exec(line);
    if (m) {
      x.push(Number(m[1]));
      y.push(Number(m[2]));
    }
  }
  if (x.length < 1000) throw new Error(`${id}: ${x.length} points read`);
  return { x, y };
}

/** Linear interpolation of a spectrum at `at` (clamped at the ends). @param {{ x: number[], y: number[] }} s @param {number} at @returns {number} */
function valueAt(s, at) {
  const n = s.x.length;
  if (at <= s.x[0]) return s.y[0];
  if (at >= s.x[n - 1]) return s.y[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.x[mid] <= at) lo = mid;
    else hi = mid;
  }
  const f = (at - s.x[lo]) / (s.x[hi] - s.x[lo]);
  return s.y[lo] + f * (s.y[hi] - s.y[lo]);
}

/**
 * A perturbed copy on a regular grid 650…4000 cm-1.
 * Options: `step` (cm-1), `shift` (cm-1, bands move up), `scale`, `slope` (baseline rise over the range, in units of the highest band),
 * `atr` (multiply by (1000/ν)^0.5), `co2` (height of a CO2 band at 2350, relative to the highest band), `noise` (standard deviation, relative), `seed`.
 * @param {{ x: number[], y: number[] }} s @param {{ step?: number, shift?: number, scale?: number, slope?: number, atr?: boolean, co2?: number, noise?: number, seed?: number }} [o]
 * @returns {{ x: number[], y: number[] }}
 */
export function perturb(s, o = {}) {
  const { step = 2, shift = 0, scale = 1, slope = 0, atr = false, co2 = 0, noise = 0, seed = 1 } = o;
  const top = Math.max(...s.y);
  const normal = gaussian(seeded(seed));
  const x = [];
  const y = [];
  for (let v = 650; v <= 4000 + 1e-9; v += step) {
    let a = valueAt(s, v - shift) * scale;
    if (atr) a *= Math.sqrt(1000 / v);
    a += top * (slope * ((v - 650) / 3350) - Math.min(0, slope)); // a falling baseline starts above zero, as a real one does
    if (co2) a += co2 * top * Math.exp(-(((v - 2350) / 6) ** 2));
    a += noise * top * normal();
    x.push(Number(v.toFixed(4)));
    y.push(a);
  }
  return { x, y };
}

/** Weighted sum of spectra, each interpolated on the grid of the first. @param {{ x: number[], y: number[] }[]} list @param {number[]} weights @returns {{ x: number[], y: number[] }} */
export function mix(list, weights) {
  const x = list[0].x;
  const y = x.map((v, i) => list.reduce((acc, s, k) => acc + weights[k] * (k === 0 ? s.y[i] : valueAt(s, v)), 0));
  return { x: [...x], y };
}

/** JCAMP-DX XYPOINTS file. @param {string} title @param {{ x: number[], y: number[] }} s @returns {Buffer} */
export function toJcamp(title, s) {
  const rows = s.x.map((v, i) => `${v.toFixed(4)}, ${s.y[i].toFixed(6)}`);
  return Buffer.from(["##TITLE=" + title, "##JCAMP-DX=4.24", "##DATA TYPE=INFRARED SPECTRUM", "##XUNITS=1/CM", "##YUNITS=ABSORBANCE", `##FIRSTX=${s.x[0]}`, `##LASTX=${s.x[s.x.length - 1]}`, `##NPOINTS=${rows.length}`, "##XYPOINTS=(XY..XY)", ...rows, "##END=", ""].join("\n"));
}

/** CSV with a header, wavenumber DEScending (as many instruments write it), decimal point. @param {{ x: number[], y: number[] }} s @returns {Buffer} */
export function toCsvDescending(s) {
  const rows = s.x.map((v, i) => `${v.toFixed(4)},${s.y[i].toFixed(6)}`).reverse();
  return Buffer.from(["wavenumber_cm1,absorbance", ...rows, ""].join("\n"));
}

/** Perturbations of the 11 pure spectra (one different combination each, all inside what a real measurement does). */
export const PURE_CASES = PURES.map(([substance, id], i) => ({
  name: `pure_${id}`,
  substance,
  id,
  options: [
    { step: 2, shift: 0.5, scale: 0.8, slope: 0.05, noise: 0.002, seed: 11 },
    { step: 4, shift: -1.5, scale: 1.3, slope: -0.04, noise: 0.002, seed: 12 },
    { step: 1, shift: 1.5, scale: 0.6, slope: 0.1, noise: 0.002, seed: 13 },
    { step: 0.5, shift: -0.7, scale: 1.0, slope: 0.03, noise: 0.002, seed: 14 },
    { step: 3, shift: 1.0, scale: 1.2, slope: 0.08, atr: true, noise: 0.002, seed: 15 },
    { step: 2, shift: -1.0, scale: 0.9, slope: -0.1, atr: true, noise: 0.002, seed: 16 },
  ][i % 6],
}));

/** Mixtures as [substance, spectrum id, weight]; the weights are parts of the signal, not amounts. */
export const MIXES = [
  { name: "mix_60_40", parts: [["caffeine", "caffeine-base.swgdrug.357", 0.6], ["paracetamol", "paracetamol-neutral.swgdrug.354", 0.4]] },
  { name: "mix_80_20", parts: [["lactose", "lactose-alpha.swgdrug.388", 0.8], ["procaine", "procaine-hcl.swgdrug.374", 0.2]] },
  { name: "mix_50_30_20", parts: [["mannitol", "mannitol-neutral.swgdrug.366", 0.5], ["phenacetin", "phenacetin-neutral.swgdrug.352", 0.3], ["levamisole", "levamisole-hcl.swgdrug.358", 0.2]] },
];

/** A mixture as one spectrum, with a little noise and baseline. @param {{ parts: (string | number)[][] }} m @param {number} seed @returns {{ x: number[], y: number[] }} */
export function mixSpectrum(m, seed) {
  const list = m.parts.map(([sub, id]) => perturb(readPure(String(sub), String(id)), { step: 2 }));
  return perturb(mix(list, m.parts.map((p) => Number(p[2]))), { step: 2, slope: 0.04, noise: 0.002, seed });
}
