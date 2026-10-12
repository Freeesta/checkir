// @ts-check
/**
 * @typedef {{ wavenumber_cm1: number[], y: number[] }} Spectrum
 */

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
