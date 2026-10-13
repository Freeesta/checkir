// @ts-check
import { svg } from "./chart_marks.js";
import { formatNumber, t } from "./i18n.js";
import { EXCLUDED_CM1 } from "./match.js";
import { thin } from "./spectrum.js";

/**
 * The guided subtraction as stacked strips that share the wavenumber axis: sample, reference × k and residual. Each strip has its own
 * label and vertical scale (the colour is never the only signal: the reference is dashed, the residual has its zero line), and every
 * strip is also a column of the table.
 * @typedef {import("./subtract.js").Strips} Strips
 */

const W = 800;
const STRIP_H = 104;
const GAP = 14;
const M = { l: 56, r: 16, t: 6, b: 40 };
const PLOT_W = W - M.l - M.r;
const MAX_ROWS = 400;

/** @param {number} lo @param {number} hi @returns {number[]} two or three round values inside the range */
function niceTicks(lo, hi) {
  const step = (hi - lo) / 3;
  const raw = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 5, 10].map((k) => k * raw).find((p) => p >= step) ?? step;
  const out = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) out.push(v);
  return out;
}

/** @param {number[]} ys @returns {[number, number]} the range of a strip, always holding zero, with a little air */
function rangeOf(ys) {
  let lo = 0;
  let hi = 0;
  for (const y of ys) {
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const pad = (hi - lo || 1) * 0.06;
  return [lo - (lo < 0 ? pad : 0), hi + pad];
}

/** @typedef {{ key: string, label: string, ys: number[], className: string }} Strip */

/** The three strips with their labels. @param {Strips} s @param {{ sample: string, name: string, k: number }} names @returns {Strip[]} */
export function stripsOf(s, names) {
  return [
    { key: "sample", label: t("subtract.strip.sample", { code: names.sample }), ys: s.sample, className: "strip-sample" },
    { key: "reference", label: t("subtract.strip.reference", { k: formatNumber(names.k, 2), name: names.name }), ys: s.reference, className: "strip-reference" },
    { key: "residual", label: t("subtract.strip.residual"), ys: s.residual, className: "strip-residual" },
  ];
}

/** @param {SVGElement} root @param {number} x0 @param {number} x1 @param {number} top @param {number} h */
function band(root, x0, x1, top, h) {
  root.append(svg("rect", { class: "excluded", x: Math.min(x0, x1), y: top, width: Math.abs(x1 - x0), height: h }));
}

/**
 * Draw the strips into `host`.
 * @param {HTMLElement} host
 * @param {Strips} s
 * @param {{ sample: string, name: string, k: number }} names
 */
export function drawStrips(host, s, names) {
  const strips = stripsOf(s, names);
  const total = M.t + strips.length * STRIP_H + (strips.length - 1) * GAP + M.b;
  const lo = Math.min(...s.x);
  const hi = Math.max(...s.x);
  const px = (/** @type {number} */ x) => M.l + ((hi - x) / (hi - lo)) * PLOT_W;
  const root = svg("svg", { viewBox: `0 0 ${W} ${total}`, role: "img", "aria-label": t("subtract.chart_label") });
  const idx = s.x.map((_, i) => i);
  strips.forEach((strip, n) => {
    const top = M.t + n * (STRIP_H + GAP);
    const [y0, y1] = rangeOf(strip.ys);
    const py = (/** @type {number} */ y) => top + STRIP_H - ((y - y0) / (y1 - y0)) * STRIP_H;
    band(root, px(Math.min(hi, EXCLUDED_CM1[1])), px(Math.max(lo, EXCLUDED_CM1[0])), top, STRIP_H);
    for (const y of niceTicks(y0, y1)) {
      root.append(svg("line", { class: y === 0 ? "grid zero" : "grid", x1: M.l, x2: W - M.r, y1: py(y), y2: py(y) }));
      const tick = svg("text", { class: "label", x: M.l - 6, y: py(y) + 4, "text-anchor": "end" });
      tick.textContent = formatNumber(y, 2);
      root.append(tick);
    }
    root.append(svg("rect", { class: "axis", x: M.l, y: top, width: PLOT_W, height: STRIP_H }));
    root.append(svg("polyline", { class: strip.className, points: thin(idx, strip.ys, PLOT_W).map((i) => `${px(s.x[i])},${py(strip.ys[i])}`).join(" ") }));
    const name = svg("text", { class: "label strip-name", x: M.l + 6, y: top + 14 });
    name.textContent = strip.label;
    root.append(name);
  });
  const base = M.t + strips.length * STRIP_H + (strips.length - 1) * GAP;
  for (let x = Math.ceil(lo / 500) * 500; x <= hi; x += 500) {
    const tick = svg("text", { class: "label", x: px(x), y: base + 16, "text-anchor": "middle" });
    tick.textContent = formatNumber(x);
    root.append(tick);
  }
  const axis = svg("text", { class: "label", x: W / 2, y: base + 34, "text-anchor": "middle" });
  axis.textContent = t("chart.axis_x");
  root.append(axis);
  host.replaceChildren(root);
}

/**
 * The data of the strips as a table (thinned to at most 400 rows), one column per strip.
 * @param {HTMLElement} host
 * @param {Strips} s
 * @param {{ sample: string, name: string, k: number }} names
 */
export function stripsTable(host, s, names) {
  const strips = stripsOf(s, names);
  const stride = Math.max(1, Math.ceil(s.x.length / MAX_ROWS));
  const tab = document.createElement("table");
  tab.createCaption().textContent = t("subtract.table_caption");
  const row = tab.createTHead().insertRow();
  for (const name of [t("table.wavenumber"), ...strips.map((x) => x.label)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = name;
    row.append(th);
  }
  const body = tab.createTBody();
  for (let i = 0; i < s.x.length; i += stride) {
    const r = body.insertRow();
    r.insertCell().textContent = formatNumber(s.x[i]);
    for (const strip of strips) r.insertCell().textContent = formatNumber(strip.ys[i], 4);
  }
  host.replaceChildren(tab);
}
