// @ts-check
/**
 * The numbers the page lays out a comparison with, read once from the engine (`comparison_limits`): the grid of the library
 * packages, the zone left out (diamond) and the smallest region. The page keeps no copy: before `loadLimits` they are NaN.
 * The objects are filled in place, so every module sees the values once they are there.
 * @typedef {[number, number]} Range
 */

export const GRID = { from: NaN, to: NaN, step: NaN };
export const MASK_CM1 = /** @type {Range} */ ([NaN, NaN]);
export const LIMITS = { minCm1: NaN, minPoints: NaN };

/** @param {Pick<import("./engine.js").Engine, "comparison_limits"> | null} engine */
export function loadLimits(engine) {
  if (!engine) return;
  const j = JSON.parse(engine.comparison_limits());
  if (j.error_key) return;
  Object.assign(GRID, { from: j.grid.from_cm1, to: j.grid.to_cm1, step: j.grid.step_cm1 });
  MASK_CM1[0] = j.mask_cm1[0];
  MASK_CM1[1] = j.mask_cm1[1];
  Object.assign(LIMITS, { minCm1: j.range_limits.min_cm1, minPoints: j.range_limits.min_points });
}
