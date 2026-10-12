// @ts-check
import { formatNumber, t } from "./i18n.js";
import { visibleIndices } from "./spectrum.js";
import { clamp, pan, zoom } from "./view.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./view.js").View} View */

const NS = "http://www.w3.org/2000/svg";
const W = 800;
const H = 360;
const M = { l: 56, r: 16, t: 12, b: 44 };
const MAX_RIGHE = 400;

/**
 * @param {string} name
 * @param {Record<string, string | number>} attr
 * @returns {SVGElement}
 */
function svg(name, attr) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attr)) el.setAttribute(k, String(v));
  return el;
}

/**
 * @param {number} lo
 * @param {number} hi
 * @param {number} n
 * @returns {number[]}
 */
function ticks(lo, hi, n) {
  const step = (hi - lo) / n;
  const raw = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 5, 10].map((k) => k * raw).find((p) => p >= step) ?? step;
  const out = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) out.push(v);
  return out;
}

/**
 * Draw the chart into `host`: SVG with axes, ticks and the curve; x axis runs from high to low wavenumber.
 * @param {HTMLElement} host
 * @param {Spectrum} s
 * @param {View} v
 */
export function draw(host, s, v) {
  const idx = visibleIndices(s, v.min, v.max);
  const ys = idx.map((i) => s.y[i]);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys) * 1.05 || 1;
  const px = (/** @type {number} */ x) => M.l + ((v.max - x) / (v.max - v.min)) * (W - M.l - M.r);
  const py = (/** @type {number} */ y) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("chart.title") });
  for (const x of ticks(v.min, v.max, 8)) {
    root.append(svg("line", { class: "grid", x1: px(x), x2: px(x), y1: M.t, y2: H - M.b }));
    const e = svg("text", { class: "label", x: px(x), y: H - M.b + 16, "text-anchor": "middle" });
    e.textContent = formatNumber(x);
    root.append(e);
  }
  for (const y of ticks(y0, y1, 5)) {
    root.append(svg("line", { class: "grid", x1: M.l, x2: W - M.r, y1: py(y), y2: py(y) }));
    const e = svg("text", { class: "label", x: M.l - 6, y: py(y) + 4, "text-anchor": "end" });
    e.textContent = formatNumber(y, 1);
    root.append(e);
  }
  root.append(svg("rect", { class: "axis", x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }));
  root.append(svg("polyline", { class: "curve", points: idx.map((i) => `${px(s.wavenumber_cm1[i])},${py(s.y[i])}`).join(" ") }));
  const ex = svg("text", { class: "label", x: W / 2, y: H - 6, "text-anchor": "middle" });
  ex.textContent = t("chart.axis_x");
  const ey = svg("text", { class: "label", x: 14, y: H / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${H / 2})` });
  ey.textContent = t("chart.axis_y");
  root.append(ex, ey);
  host.replaceChildren(root);
}

/**
 * Accessible table with the points in the view (thinned to at most MAX_RIGHE rows).
 * @param {HTMLElement} host
 * @param {Spectrum} s
 * @param {View} v
 */
export function table(host, s, v) {
  const idx = visibleIndices(s, v.min, v.max);
  const stride = Math.max(1, Math.ceil(idx.length / MAX_RIGHE));
  const tab = document.createElement("table");
  const cap = tab.createCaption();
  cap.textContent = t("table.caption");
  const row = tab.createTHead().insertRow();
  for (const name of [t("table.wavenumber"), t("table.absorbance")]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = name;
    row.append(th);
  }
  const body = tab.createTBody();
  for (let j = 0; j < idx.length; j += stride) {
    const r = body.insertRow();
    r.insertCell().textContent = formatNumber(s.wavenumber_cm1[idx[j]]);
    r.insertCell().textContent = formatNumber(s.y[idx[j]], 4);
  }
  host.replaceChildren(tab);
}

/**
 * Wire the chart: keyboard (+ - arrows 0) and buttons, both without any drag.
 * @param {{ chart: HTMLElement, toolbar: HTMLElement, tab: HTMLElement, range: HTMLElement }} el
 * @param {Spectrum} s
 * @returns {() => void} redraw (call after a language change)
 */
export function wire(el, s) {
  const xs = s.wavenumber_cm1;
  const full = { min: Math.min(...xs), max: Math.max(...xs) };
  let v = { ...full };
  const update = () => {
    draw(el.chart, s, v);
    table(el.tab, s, v);
    el.range.textContent = t("chart.range", { from: formatNumber(v.min), to: formatNumber(v.max) });
  };
  /** @type {Array<[string, () => string, () => View]>} */
  const actions = [
    ["+", () => t("chart.zoom_in"), () => zoom(v, full, 0.5)],
    ["−", () => t("chart.zoom_out"), () => zoom(v, full, 2)],
    ["←", () => t("chart.pan_left"), () => pan(v, full, -0.25)],
    ["→", () => t("chart.pan_right"), () => pan(v, full, 0.25)],
    ["0", () => t("chart.reset"), () => clamp({ ...full }, full)],
  ];
  const keys = { "+": 0, "=": 0, "-": 1, ArrowLeft: 2, ArrowRight: 3, "0": 4 };
  const apply = (/** @type {number} */ i) => {
    v = actions[i][2]();
    update();
  };
  el.toolbar.replaceChildren(
    ...actions.map(([symbol, label], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = symbol;
      b.setAttribute("aria-label", label());
      b.title = label();
      b.addEventListener("click", () => apply(i));
      return b;
    }),
  );
  el.chart.addEventListener("keydown", (e) => {
    const i = keys[/** @type {keyof typeof keys} */ (e.key)];
    if (i === undefined) return;
    e.preventDefault();
    apply(i);
  });
  update();
  return update;
}
