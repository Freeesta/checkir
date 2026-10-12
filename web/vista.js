// @ts-check
/** View window of the chart (cm⁻¹) and its transitions; pure functions, no DOM. */

/**
 * @typedef {{ min: number, max: number }} Vista
 */

const MIN_LARGHEZZA = 20;

/**
 * Zoom around the centre of the view; factor < 1 zooms in. The result stays inside `intera`.
 * @param {Vista} v
 * @param {Vista} intera
 * @param {number} fattore
 * @returns {Vista}
 */
export function zoom(v, intera, fattore) {
  const c = (v.min + v.max) / 2;
  const largo = Math.min(Math.max((v.max - v.min) * fattore, MIN_LARGHEZZA), intera.max - intera.min);
  return dentro({ min: c - largo / 2, max: c + largo / 2 }, intera);
}

/**
 * Pan by a fraction of the view width.
 * @param {Vista} v
 * @param {Vista} intera
 * @param {number} frazione
 * @returns {Vista}
 */
export function sposta(v, intera, frazione) {
  const d = (v.max - v.min) * frazione;
  return dentro({ min: v.min + d, max: v.max + d }, intera);
}

/**
 * Shift a view back inside the full range, keeping its width.
 * @param {Vista} v
 * @param {Vista} intera
 * @returns {Vista}
 */
export function dentro(v, intera) {
  const w = v.max - v.min;
  const min = Math.min(Math.max(v.min, intera.min), intera.max - w);
  return { min, max: min + w };
}
