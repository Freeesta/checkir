// @ts-check
/** View window of the chart (cm⁻¹) and its transitions; pure functions, no DOM. */

/**
 * @typedef {{ min: number, max: number }} View
 */

const MIN_WIDTH = 20;

/**
 * Zoom around the centre of the view; factor < 1 zooms in. The result stays inside `full`.
 * @param {View} v
 * @param {View} full
 * @param {number} factor
 * @returns {View}
 */
export function zoom(v, full, factor) {
  const c = (v.min + v.max) / 2;
  const width = Math.min(Math.max((v.max - v.min) * factor, MIN_WIDTH), full.max - full.min);
  return clamp({ min: c - width / 2, max: c + width / 2 }, full);
}

/**
 * Pan by a fraction of the view width.
 * @param {View} v
 * @param {View} full
 * @param {number} fraction
 * @returns {View}
 */
export function pan(v, full, fraction) {
  const d = (v.max - v.min) * fraction;
  return clamp({ min: v.min + d, max: v.max + d }, full);
}

/**
 * Shift a view back inside the full range, keeping its width.
 * @param {View} v
 * @param {View} full
 * @returns {View}
 */
export function clamp(v, full) {
  const w = v.max - v.min;
  const min = Math.min(Math.max(v.min, full.min), full.max - w);
  return { min, max: min + w };
}

/**
 * Zoom keeping the wavenumber `at` where it is on screen (wheel zoom around the pointer); factor < 1 zooms in.
 * @param {View} v
 * @param {View} full
 * @param {number} factor
 * @param {number} at
 * @returns {View}
 */
export function zoomAt(v, full, factor, at) {
  const old = v.max - v.min;
  const width = Math.min(Math.max(old * factor, MIN_WIDTH), full.max - full.min);
  const ratio = (at - v.min) / old;
  const min = at - ratio * width;
  return clamp({ min, max: min + width }, full);
}

/**
 * The view spanning two wavenumbers (box zoom), never narrower than the minimum width.
 * @param {View} full
 * @param {number} a
 * @param {number} b
 * @returns {View}
 */
export function spanOf(full, a, b) {
  const mid = (a + b) / 2;
  const width = Math.min(Math.max(Math.abs(a - b), MIN_WIDTH), full.max - full.min);
  return clamp({ min: mid - width / 2, max: mid + width / 2 }, full);
}
