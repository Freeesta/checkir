// @ts-check
// SVG helpers of the theory figures: element builder, accessible figure frame, spectrum axes (x decreasing, as in IR spectroscopy).
const NS = "http://www.w3.org/2000/svg";

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Array<Node | string>} [children]
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  node.append(...children);
  return node;
}

let counter = 0;

/**
 * Root `<svg role="img">` with `<title>` and `<desc>` (the name and the long description of the figure).
 * @param {number} width viewBox width
 * @param {number} height viewBox height
 * @param {string} title
 * @param {string} desc
 * @returns {SVGSVGElement}
 */
export function figureSvg(width, height, title, desc) {
  counter += 1;
  const id = `fig${counter}`;
  const root = /** @type {SVGSVGElement} */ (svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "theory-svg", role: "img", "aria-labelledby": `${id}-t ${id}-d` }));
  root.append(svg("title", { id: `${id}-t` }, [title]), svg("desc", { id: `${id}-d` }, [desc]));
  return root;
}

/** @param {string} text @param {number} x @param {number} y @param {Record<string, string | number>} [attrs] @returns {SVGElement} */
export function label(text, x, y, attrs = {}) {
  return svg("text", { x, y, class: "fig-text", ...attrs }, [text]);
}

/**
 * Linear scale from a data interval to a pixel interval.
 * @param {number} d0 @param {number} d1 @param {number} p0 @param {number} p1
 * @returns {(v: number) => number}
 */
export function scale(d0, d1, p0, p1) {
  return (v) => p0 + ((v - d0) / (d1 - d0)) * (p1 - p0);
}

/**
 * Polyline path `d` of points already in pixels.
 * @param {Array<[number, number]>} pts
 * @returns {string}
 */
export function pathOf(pts) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
}

/**
 * Keep roughly `n` points: the spectrum is drawn lighter, the data stay in the table.
 * @param {number[]} xs @param {number[]} ys @param {number} from @param {number} to @param {number} step
 * @returns {Array<[number, number]>} points with x in [from, to], at least `step` cm-1 apart
 */
export function decimate(xs, ys, from, to, step) {
  /** @type {Array<[number, number]>} */
  const out = [];
  let last = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x < from || x > to || x - last < step) continue;
    out.push([x, ys[i]]);
    last = x;
  }
  return out;
}
