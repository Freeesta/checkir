// @ts-check
import { svg } from "./chart_marks.js";

/**
 * The region of the comparison on the chart: the parts left out are grey with the words «fuori regione», each chosen region has a
 * bracket on top with its number (never colour alone), and the strip under the x axis is the brush: a drag there chooses a region.
 * @typedef {{ chosen: Array<[number, number]>, outsideLabel: string, name: (n: number) => string }} RangeLayer
 */

/** Height of the brush strip under the plot, in SVG units. */
export const BRUSH_HEIGHT = 24;

/** The parts of [lo, hi] not covered by the sorted, merged ranges. @param {Array<[number, number]>} ranges @param {number} lo @param {number} hi @returns {Array<[number, number]>} */
export function complement(ranges, lo, hi) {
  /** @type {Array<[number, number]>} */
  const out = [];
  let at = lo;
  for (const [a, b] of ranges) {
    if (a > at) out.push([at, Math.min(a, hi)]);
    at = Math.max(at, b);
  }
  if (at < hi) out.push([at, hi]);
  return out.filter(([a, b]) => b > a);
}

/**
 * @param {SVGElement} root @param {RangeLayer} layer @param {{ min: number, max: number }} v
 * @param {(x: number) => number} px @param {{ top: number, height: number }} box
 */
export function drawRangeZones(root, layer, v, px, box) {
  const sorted = [...layer.chosen].sort((p, q) => p[0] - q[0]);
  for (const [a, b] of complement(sorted, v.min, v.max)) {
    const [x0, x1] = [px(b), px(a)];
    root.append(svg("rect", { class: "excluded range-out", x: x0, y: box.top, width: x1 - x0, height: box.height }));
    if (x1 - x0 < 90) continue;
    const label = svg("text", { class: "label excluded-label", x: (x0 + x1) / 2, y: box.top + box.height - 8, "text-anchor": "middle" });
    label.textContent = layer.outsideLabel;
    root.append(label);
  }
  sorted.forEach(([a, b], i) => {
    if (b < v.min || a > v.max) return;
    const [x0, x1] = [px(Math.min(b, v.max)), px(Math.max(a, v.min))];
    root.append(svg("rect", { class: "range-chosen", x: x0, y: box.top, width: x1 - x0, height: 5 }));
    const label = svg("text", { class: "label range-name", x: (x0 + x1) / 2, y: box.top + 18, "text-anchor": "middle" });
    label.textContent = layer.name(i + 1);
    root.append(label);
  });
}

/** The brush strip under the plot (invisible, a drag on it chooses a region). @param {SVGElement} root @param {{ left: number, right: number, bottom: number }} g */
export function drawBrushStrip(root, g) {
  root.append(svg("rect", { class: "brush-strip", x: g.left, y: g.bottom, width: g.right - g.left, height: BRUSH_HEIGHT }));
}
