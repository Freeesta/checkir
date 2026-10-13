// @ts-check
/**
 * @typedef {{ wavenumber_cm1: number[], y: number[], y_unit?: string }} Spectrum
 * @typedef {{ key: string, params: Record<string, string> }} Notice
 * @typedef {{ error: Notice } | { spectrum: Spectrum, resolutionCm1: number | null, sampling: string, notices: Notice[], more: number }} OpenResult
 */

/** The unit names the engine knows, by the unit string the reader gives; `Transmittance` is the old name of percent.
 * @type {Record<string, string>} */
const ENGINE_UNITS = { Absorbance: "absorbance", Transmittance: "transmittance_percent", TransmittancePercent: "transmittance_percent", TransmittanceFraction: "transmittance_fraction" };

/** @param {Spectrum} s @returns {string | null} the unit name the engine converts itself (the values go as they are), null for any other unit */
export function engineUnit(s) {
  return s.y_unit === undefined ? "absorbance" : (ENGINE_UNITS[s.y_unit] ?? null);
}

/** @param {Spectrum} s @returns {"absorbance" | "transmittance_percent" | "transmittance_fraction" | "intensity"} what the y axis shows */
export function axisKind(s) {
  const u = engineUnit(s);
  return u === "absorbance" || u === "transmittance_percent" || u === "transmittance_fraction" ? u : "intensity";
}

/**
 * Parse the JSON of a spectrum coming from the engine.
 * @param {string} json
 * @returns {Spectrum}
 */
export function parseSpectrum(json) {
  const s = JSON.parse(json);
  if (!Array.isArray(s.wavenumber_cm1) || !Array.isArray(s.y) || s.y.length !== s.wavenumber_cm1.length) {
    throw new Error("spectrum non valido");
  }
  return s;
}

/**
 * Indices of the points whose wavenumber lies in [min, max].
 * @param {Spectrum} s
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
export function visibleIndices(s, min, max) {
  const out = [];
  for (let i = 0; i < s.wavenumber_cm1.length; i++) {
    const x = s.wavenumber_cm1[i];
    if (x >= min && x <= max) out.push(i);
  }
  return out;
}

/** @param {{ first: number, last: number, n: number }} r @returns {number[]} */
function expandAxis(r) {
  const step = r.n > 1 ? (r.last - r.first) / (r.n - 1) : 0;
  return Array.from({ length: r.n }, (_, i) => (i === r.n - 1 && r.n > 1 ? r.last : r.first + step * i));
}

/** @param {any} w @returns {Notice} */
function notice(w) {
  return { key: w.key, params: w.params ?? {} };
}

/**
 * Turn the JSON of `open_file` into the primary spectrum plus what the page shows about it; errors become translatable keys.
 * Only spectra on a wavenumber axis (cm-1) are shown; other axes are refused until the user can choose units.
 * @param {string} json
 * @returns {OpenResult}
 */
export function parseDocument(json) {
  /** @type {any} */
  let doc;
  try {
    doc = JSON.parse(json);
  } catch {
    return { error: { key: "err.file.unreadable", params: {} } };
  }
  if (typeof doc.error_key === "string") return { error: { key: doc.error_key, params: doc.params ?? {} } };
  const sp = doc.spectra?.[doc.primary];
  if (!sp) return { error: { key: "err.file.no_spectrum", params: {} } };
  if (sp.x.unit !== "Cm1") return { error: { key: "err.file.axis_unit", params: {} } };
  const xs = Array.isArray(sp.x.values) ? sp.x.values : expandAxis(sp.x.values);
  if (xs.length < 2 || xs.length !== sp.y.values.length) return { error: { key: "err.file.unreadable", params: {} } };
  const notices = [...(doc.warnings ?? []), ...sp.warnings].filter((w) => w.severity === "Caution").map(notice);
  return {
    spectrum: { wavenumber_cm1: xs, y: sp.y.values, y_unit: sp.y.unit },
    resolutionCm1: typeof sp.instrument?.resolution_cm1 === "number" ? sp.instrument.resolution_cm1 : null,
    sampling: typeof sp.instrument?.sampling === "string" ? sp.instrument.sampling : "unknown",
    notices,
    more: doc.spectra.length - 1,
  };
}

/**
 * Min/max reduction: at most two points per bucket, so a long spectrum costs the same to draw as a short one.
 * @param {number[]} idx indices in file order
 * @param {number[]} ys
 * @param {number} buckets
 * @returns {number[]}
 */
export function thin(idx, ys, buckets) {
  if (idx.length <= buckets * 2) return idx;
  const out = [];
  const size = idx.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(idx.length, Math.floor((b + 1) * size));
    let lo = from;
    let hi = from;
    for (let j = from; j < to; j++) {
      if (ys[idx[j]] < ys[idx[lo]]) lo = j;
      if (ys[idx[j]] > ys[idx[hi]]) hi = j;
    }
    for (const j of lo < hi ? [lo, hi] : lo === hi ? [lo] : [hi, lo]) out.push(idx[j]);
  }
  return out;
}

/**
 * Index of the point nearest to a wavenumber, by bisection (the axis is monotonic, either way).
 * @param {Spectrum} s
 * @param {number} x
 * @returns {number} -1 for an empty spectrum
 */
export function nearestIndex(s, x) {
  const xs = s.wavenumber_cm1;
  if (!xs.length) return -1;
  const up = xs[xs.length - 1] >= xs[0];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x === up) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

/**
 * The wavenumber of the highest point within `half` cm⁻¹ of `x` (the top of the peak the pointer is on); `x` itself when the spectrum has no points there.
 * @param {Spectrum} s @param {number} x @param {number} half @returns {number}
 */
export function topNear(s, x, half) {
  let best = -1;
  s.wavenumber_cm1.forEach((w, i) => {
    if (Math.abs(w - x) <= half && Number.isFinite(s.y[i]) && (best < 0 || s.y[i] > s.y[best])) best = i;
  });
  return best < 0 ? x : s.wavenumber_cm1[best];
}
