// @ts-check
import { svg } from "./chart_marks.js";
import { nearestIndex, thin, visibleIndices } from "./spectrum.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./view.js").View} View */
/** A curve beside the sample: a recalled library compound (style 0–2 picks the dash, `shift` moves it down when the view is offset) or the difference.
 * @typedef {{ spectrum: Spectrum, label: string, kind: "recalled" | "difference", style: number, shift: number }} Extra */

/** The extra curves a layers object asks for. @param {{ recalled?: Array<{ spectrum: Spectrum, label: string, style: number }>, difference?: { spectrum: Spectrum, label: string } | null, offset?: number }} layers @returns {Extra[]} */
export function extraCurves(layers) {
  /** @type {Extra[]} */
  const out = (layers.recalled ?? []).map((r, i) => ({ ...r, kind: "recalled", shift: -(i + 1) * (layers.offset ?? 0) }));
  if (layers.difference) out.push({ ...layers.difference, kind: "difference", style: 0, shift: 0 });
  return out;
}

/** Widen a y range so every extra curve fits in the view, keeping the 5 % of air on top. @param {{ y0: number, y1: number }} ext @param {Extra[]} extras @param {View} v @returns {{ y0: number, y1: number }} */
export function widen(ext, extras, v) {
  let { y0, y1 } = ext;
  for (const e of extras) {
    for (const i of visibleIndices(e.spectrum, v.min, v.max)) {
      const y = e.spectrum.y[i] + e.shift;
      if (!Number.isFinite(y)) continue;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y + (y - y0) * 0.05;
    }
  }
  return { y0, y1 };
}

/** Draw the extra curves, each with its label at the low-wavenumber end (never colour alone: dash and text). @param {SVGElement} root @param {Extra[]} extras @param {View} v @param {number} plotWidth @param {{ px: (x: number) => number, py: (y: number) => number, right: number }} g */
export function drawExtras(root, extras, v, plotWidth, g) {
  for (const e of extras) {
    const idx = visibleIndices(e.spectrum, v.min, v.max).filter((i) => Number.isFinite(e.spectrum.y[i]));
    if (!idx.length) continue;
    const pts = thin(idx, e.spectrum.y, plotWidth).map((i) => `${g.px(e.spectrum.wavenumber_cm1[i])},${g.py(e.spectrum.y[i] + e.shift)}`);
    root.append(svg("polyline", { class: `curve-${e.kind} curve-style-${e.style}`, points: pts.join(" ") }));
    const last = idx.reduce((a, b) => (e.spectrum.wavenumber_cm1[b] < e.spectrum.wavenumber_cm1[a] ? b : a));
    const label = svg("text", { class: `label extra-label extra-label-${e.kind}`, x: g.right - 4, y: g.py(e.spectrum.y[last] + e.shift) - 4, "text-anchor": "end" });
    label.textContent = e.label;
    root.append(label);
  }
}

/** The value of an extra curve at a wavenumber (nearest point within its own step), or null. @param {Extra} e @param {number} x @returns {number | null} */
export function extraAt(e, x) {
  const s = e.spectrum;
  const n = s.wavenumber_cm1.length;
  const i = nearestIndex(s, x);
  const step = n > 1 ? Math.abs(s.wavenumber_cm1[n - 1] - s.wavenumber_cm1[0]) / (n - 1) : 0;
  return i >= 0 && Math.abs(s.wavenumber_cm1[i] - x) <= step * 1.01 && Number.isFinite(s.y[i]) ? s.y[i] : null;
}
