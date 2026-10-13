// @ts-check
import { svg } from "./chart_marks.js";

/**
 * The region of the comparison on the chart: a light band under the x axis with the number of each chosen region (never colour alone); the strip under the x axis is also the brush: a drag there chooses a region.
 * @typedef {{ chosen: Array<[number, number]>, name: (n: number) => string }} RangeLayer
 */

/** Height of the brush strip under the plot, in SVG units. */
export const BRUSH_HEIGHT = 24;

/**
 * Each chosen region as a light band just under the x axis with its number above the axis line (the zone left out keeps its own grey band).
 * @param {SVGElement} root @param {RangeLayer} layer @param {{ min: number, max: number }} v
 * @param {(x: number) => number} px @param {{ top: number, height: number }} box
 */
export function drawRangeZones(root, layer, v, px, box) {
  [...layer.chosen].sort((p, q) => p[0] - q[0]).forEach(([a, b], i) => {
    if (b < v.min || a > v.max) return;
    const [x0, x1] = [px(Math.min(b, v.max)), px(Math.max(a, v.min))];
    const bottom = box.top + box.height;
    root.append(svg("rect", { class: "range-band", x: x0, y: bottom + 1, width: x1 - x0, height: 6 }));
    const label = svg("text", { class: "label range-name", x: (x0 + x1) / 2, y: bottom - 5, "text-anchor": "middle" });
    label.textContent = layer.name(i + 1);
    root.append(label);
  });
}

/** The brush strip under the plot (invisible, a drag on it chooses a region). @param {SVGElement} root @param {{ left: number, right: number, bottom: number }} g */
export function drawBrushStrip(root, g) {
  root.append(svg("rect", { class: "brush-strip", x: g.left, y: g.bottom, width: g.right - g.left, height: BRUSH_HEIGHT }));
}
