// @ts-check
/**
 * @typedef {{ numero_onda_cm1: number[], y: number[] }} Spettro
 */

/**
 * Parse the JSON of a spectrum coming from the engine.
 * @param {string} json
 * @returns {Spettro}
 */
export function leggiSpettro(json) {
  const s = JSON.parse(json);
  if (!Array.isArray(s.numero_onda_cm1) || !Array.isArray(s.y) || s.y.length !== s.numero_onda_cm1.length) {
    throw new Error("spettro non valido");
  }
  return s;
}

/**
 * Indices of the points whose wavenumber lies in [min, max].
 * @param {Spettro} s
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
export function indiciVisibili(s, min, max) {
  const out = [];
  for (let i = 0; i < s.numero_onda_cm1.length; i++) {
    const x = s.numero_onda_cm1[i];
    if (x >= min && x <= max) out.push(i);
  }
  return out;
}
