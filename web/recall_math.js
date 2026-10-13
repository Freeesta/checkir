// @ts-check
/**
 * Pure arithmetic of the recalled references: the four scales, the value of a library curve on the sample points and the two
 * correlations shown next to each reference. Indicative numbers for the chemist to look at; the comparison itself stays in the engine.
 */

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {"raw" | "max" | "area" | "lsq"} Scale */
export const SCALES = /** @type {Scale[]} */ (["raw", "max", "area", "lsq"]);

/** Library value at a wavenumber (linear between grid points), or NaN outside the curve. @param {Spectrum} ref @param {number} x @returns {number} */
export function valueAt(ref, x) {
  const xs = ref.wavenumber_cm1;
  const n = xs.length;
  if (n < 2) return NaN;
  const step = (xs[n - 1] - xs[0]) / (n - 1);
  const f = (x - xs[0]) / step;
  if (f < 0 || f > n - 1) return NaN;
  const i = Math.min(n - 2, Math.floor(f));
  const a = ref.y[i];
  const b = ref.y[i + 1];
  return a + (b - a) * (f - i);
}

/**
 * Sample and reference values on the sample points where both exist and the point is not in the excluded zone.
 * @param {Spectrum} sample @param {Spectrum} ref @param {[number, number]} excluded
 * @returns {{ x: number[], s: number[], r: number[] }}
 */
export function pairs(sample, ref, excluded) {
  /** @type {{ x: number[], s: number[], r: number[] }} */
  const out = { x: [], s: [], r: [] };
  for (let i = 0; i < sample.y.length; i++) {
    const x = sample.wavenumber_cm1[i];
    const r = valueAt(ref, x);
    if (!Number.isFinite(r) || !Number.isFinite(sample.y[i]) || (x >= excluded[0] && x <= excluded[1])) continue;
    out.x.push(x);
    out.s.push(sample.y[i]);
    out.r.push(r);
  }
  return out;
}

/** @param {number[]} v @returns {number} */
const max = (v) => v.reduce((m, y) => (y > m ? y : m), 0);

/** Area under a curve by the trapezoid rule over the given (ordered or not) points. @param {number[]} x @param {number[]} y @returns {number} */
function area(x, y) {
  let a = 0;
  for (let i = 1; i < x.length; i++) a += Math.abs(x[i] - x[i - 1]) * ((y[i] + y[i - 1]) / 2);
  return a;
}

/**
 * The factor that scales the reference for a given scale: as measured (1), same highest band, same area, or least squares.
 * @param {Scale} scale @param {{ x: number[], s: number[], r: number[] }} p @returns {number} 1 when it cannot be worked out
 */
export function scaleFactor(scale, p) {
  let k = 1;
  if (scale === "max") k = max(p.s) / max(p.r);
  else if (scale === "area") k = area(p.x, p.s) / area(p.x, p.r);
  else if (scale === "lsq") {
    let num = 0;
    let den = 0;
    for (let i = 0; i < p.s.length; i++) {
      num += p.s[i] * p.r[i];
      den += p.r[i] * p.r[i];
    }
    k = den > 0 ? Math.max(0, num / den) : 1;
  }
  return Number.isFinite(k) && k > 0 ? k : 1;
}

/** Pearson correlation of two equal-length arrays, or null when one is flat. @param {number[]} a @param {number[]} b @returns {number | null} */
export function pearson(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/** First derivative after a 5-point moving average (ends dropped). @param {number[]} y @returns {number[]} */
function derivative(y) {
  const smooth = y.map((_, i) => (i < 2 || i > y.length - 3 ? NaN : (y[i - 2] + y[i - 1] + y[i] + y[i + 1] + y[i + 2]) / 5));
  return smooth.map((v, i) => (Number.isFinite(v) && Number.isFinite(smooth[i + 1]) ? smooth[i + 1] - v : NaN));
}

/**
 * Correlation of the spectrum and of its first derivative between the sample and a reference, over the points both have outside the excluded zone.
 * @param {Spectrum} sample @param {Spectrum} ref @param {[number, number]} excluded
 * @returns {{ spectrum: number | null, derivative: number | null }}
 */
export function correlations(sample, ref, excluded) {
  const p = pairs(sample, ref, excluded);
  const ds = derivative(p.s);
  const dr = derivative(p.r);
  const keep = ds.map((v, i) => Number.isFinite(v) && Number.isFinite(dr[i]));
  return { spectrum: pearson(p.s, p.r), derivative: pearson(ds.filter((_, i) => keep[i]), dr.filter((_, i) => keep[i])) };
}
