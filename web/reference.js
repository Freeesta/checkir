// @ts-check
/**
 * The library spectrum of a candidate scaled to the sample for the overlay and the peak assignment. The factor and the scaled values
 * come from the engine (`reference_scale`, `reference_scaled`); the page only hands over the two curves and the zone left out.
 */
import { libraryCurve } from "./match.js";

/** @type {Pick<import("./engine.js").Engine, "reference_scale" | "reference_scaled"> | null} */
let engine = null;

/** @param {Pick<import("./engine.js").Engine, "reference_scale" | "reference_scaled"> | null} e */
export function useReferenceEngine(e) {
  engine = e;
}

/**
 * @param {string} library @param {string} spectrumId
 * @param {import("./spectrum.js").Spectrum} sample
 * @param {[number, number]} excluded zone left out of the comparison, cm⁻¹
 * @returns {{ spectrum: import("./spectrum.js").Spectrum, scale: number } | null}
 */
export function referenceFor(library, spectrumId, sample, excluded) {
  const curve = libraryCurve(library, spectrumId);
  if (!curve || !engine) return null;
  const sx = Float64Array.from(sample.wavenumber_cm1);
  const sy = Float64Array.from(sample.y);
  const rx = Float64Array.from(curve.wavenumber_cm1);
  const ry = Float64Array.from(curve.y);
  const scale = engine.reference_scale(sx, sy, rx, ry, excluded[0], excluded[1]);
  const y = Array.from(engine.reference_scaled(sx, sy, rx, ry, excluded[0], excluded[1]));
  return { spectrum: { wavenumber_cm1: curve.wavenumber_cm1, y }, scale };
}
