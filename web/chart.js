// @ts-check
import { formatNumber, t } from "./i18n.js";
import { drawBands, drawPeaks, marksTables, svg } from "./chart_marks.js";
import { nearestIndex, thin, visibleIndices } from "./spectrum.js";
import { drawExtras, extraAt, extraCurves, widen } from "./chart_extra.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./view.js").View} View */
/** Extra curves and zones drawn with the sample: the library spectrum of a candidate (already scaled) and the zone left out of the comparison.
 * @typedef {{ reference?: { spectrum: Spectrum, label: string, scale: number } | null, excluded?: { from: number, to: number, label: string } | null, marks?: import("./chart_marks.js").Marks | null, recalled?: Array<{ spectrum: Spectrum, label: string, style: number }>, difference?: { spectrum: Spectrum, label: string } | null, offset?: number }} Layers */

const W = 800;
const H = 360;
const M = { l: 56, r: 16, t: 30, b: 44 };
const MAX_RIGHE = 400;
const PLOT_W = W - M.l - M.r;

/** @param {Spectrum} s @returns {string} */
function yLabel(s) {
  return s.y_unit === undefined || s.y_unit === "Absorbance" ? t("chart.axis_y") : t("chart.axis_y_other");
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

/** Draw the zone left out of the comparison as a grey band with a dashed edge and a label (never colour alone). @param {SVGElement} root @param {Layers["excluded"]} zone @param {View} v @param {(x: number) => number} px */
function drawExcluded(root, zone, v, px) {
  if (!zone || zone.to < v.min || zone.from > v.max) return;
  const a = px(Math.min(zone.to, v.max));
  const b = px(Math.max(zone.from, v.min));
  root.append(svg("rect", { class: "excluded", x: a, y: M.t, width: b - a, height: H - M.t - M.b }));
  const label = svg("text", { class: "label excluded-label", x: (a + b) / 2, y: M.t + 14, "text-anchor": "middle" });
  label.textContent = zone.label;
  root.append(label);
}

/** Lowest and highest value of the sample and of the reference curve in the view; the top gets 5 % of air. @param {Spectrum} s @param {number[]} idx @param {Spectrum | null} ref @param {number[]} refIdx @returns {{ y0: number, y1: number }} */
function yExtent(s, idx, ref, refIdx) {
  let y0 = 0;
  let y1 = -Infinity;
  for (const i of idx) {
    if (s.y[i] < y0) y0 = s.y[i];
    if (s.y[i] > y1) y1 = s.y[i];
  }
  for (const i of refIdx) {
    const y = /** @type {Spectrum} */ (ref).y[i];
    if (!Number.isFinite(y)) continue;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { y0, y1: y1 > y0 ? (y1 - y0) * 1.05 + y0 : y0 + 1 };
}

/** Grid lines and tick labels of both axes. @param {SVGElement} root @param {View} v @param {{ y0: number, y1: number }} y @param {(x: number) => number} px @param {(y: number) => number} py */
function drawGrid(root, v, y, px, py) {
  for (const x of ticks(v.min, v.max, 8)) {
    root.append(svg("line", { class: "grid", x1: px(x), x2: px(x), y1: M.t, y2: H - M.b }));
    const e = svg("text", { class: "label", x: px(x), y: H - M.b + 16, "text-anchor": "middle" });
    e.textContent = formatNumber(x);
    root.append(e);
  }
  for (const yy of ticks(y.y0, y.y1, 5)) {
    root.append(svg("line", { class: "grid", x1: M.l, x2: W - M.r, y1: py(yy), y2: py(yy) }));
    const e = svg("text", { class: "label", x: M.l - 6, y: py(yy) + 4, "text-anchor": "end" });
    e.textContent = formatNumber(yy, 1);
    root.append(e);
  }
}

/** Options of a redraw: a locked y range, and the cursor layer mounted under the axis titles. @typedef {{ yLock?: { y0: number, y1: number } | null, cursors?: ReturnType<typeof import("./chart_cursors.js").createCursors> }} DrawOptions */

/**
 * Draw the chart into `host`: SVG with axes, ticks and the curve; x axis runs from high to low wavenumber. Only the SVG is replaced, so anything else in the host survives.
 * @param {HTMLElement} host
 * @param {Spectrum} s
 * @param {View} v
 * @param {Layers} [layers]
 * @param {DrawOptions} [opts]
 * @returns {import("./chart_cursors.js").Geometry & { y0: number, y1: number }}
 */
export function draw(host, s, v, layers = {}, opts = {}) {
  const idx = visibleIndices(s, v.min, v.max);
  const ref = layers.reference?.spectrum ?? null;
  const extras = extraCurves(layers);
  const { y0, y1 } = opts.yLock ?? widen(yExtent(s, idx, ref, ref ? visibleIndices(ref, v.min, v.max) : []), extras, v);
  const px = (/** @type {number} */ x) => M.l + ((v.max - x) / (v.max - v.min)) * (W - M.l - M.r);
  const py = (/** @type {number} */ y) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("chart.title") });
  drawGrid(root, v, { y0, y1 }, px, py);
  drawExcluded(root, layers.excluded, v, px);
  if (layers.marks) drawBands(root, layers.marks.bands, v, px, { top: M.t, height: H - M.t - M.b });
  root.append(svg("rect", { class: "axis", x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }));
  if (ref) drawReference(root, ref, v, layers, px, py);
  drawExtras(root, extras, v, PLOT_W, { px, py, right: W - M.r });
  root.append(svg("polyline", { class: "curve", points: thin(idx, s.y, PLOT_W).map((i) => `${px(s.wavenumber_cm1[i])},${py(s.y[i])}`).join(" ") }));
  if (layers.marks) drawPeaks(root, layers.marks.peaks, v, px, (x) => py(s.y[Math.max(0, nearestIndex(s, x))]));
  const ex = svg("text", { class: "label", x: W / 2, y: H - 6, "text-anchor": "middle" });
  ex.textContent = t("chart.axis_x");
  const ey = svg("text", { class: "label", x: 14, y: H / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${H / 2})` });
  ey.textContent = yLabel(s);
  const geom = { left: M.l, right: W - M.r, top: M.t, bottom: H - M.b, width: W, height: H, px, py, y0, y1 };
  opts.cursors?.mount(root, geom, s);
  root.append(ex, ey);
  const old = host.querySelector(":scope > svg");
  if (old) old.replaceWith(root);
  else host.replaceChildren(root);
  return geom;
}

/** The library curve (dashed) and its legend. @param {SVGElement} root @param {Spectrum} ref @param {View} v @param {Layers} layers @param {(x: number) => number} px @param {(y: number) => number} py */
function drawReference(root, ref, v, layers, px, py) {
  const kept = thin(visibleIndices(ref, v.min, v.max).filter((i) => Number.isFinite(ref.y[i])), ref.y, PLOT_W);
  root.append(svg("polyline", { class: "curve-reference", points: kept.map((i) => `${px(ref.wavenumber_cm1[i])},${py(ref.y[i])}`).join(" ") }));
  const legend = svg("text", { class: "label reference-label", x: W - M.r - 6, y: M.t + 28, "text-anchor": "end" });
  legend.textContent = /** @type {{ label: string }} */ (layers.reference).label;
  root.append(legend);
}

/** The scaled library value nearest to a wavenumber (the library grid is regular), or null outside it. @param {Spectrum} ref @param {number} x @returns {number | null} */
function referenceAt(ref, x) {
  const step = ref.wavenumber_cm1[1] - ref.wavenumber_cm1[0];
  const i = Math.round((x - ref.wavenumber_cm1[0]) / step);
  return i >= 0 && i < ref.y.length && Number.isFinite(ref.y[i]) ? ref.y[i] : null;
}

/**
 * Accessible table with the points in the view (thinned to at most MAX_RIGHE rows); with a reference curve it has one more column.
 * @param {HTMLElement} host
 * @param {Spectrum} s
 * @param {View} v
 * @param {Layers} [layers]
 */
export function table(host, s, v, layers = {}) {
  const ref = layers.reference ?? null;
  const extras = extraCurves(layers);
  const idx = visibleIndices(s, v.min, v.max);
  const stride = Math.max(1, Math.ceil(idx.length / MAX_RIGHE));
  const tab = document.createElement("table");
  const cap = tab.createCaption();
  cap.textContent = ref ? `${t("table.caption")} ${t("table.reference_note", { label: ref.label, scale: formatNumber(ref.scale, 2) })}` : t("table.caption");
  const row = tab.createTHead().insertRow();
  for (const name of [t("table.wavenumber"), yLabel(s), ...(ref ? [t("table.reference")] : []), ...extras.map((e) => e.label)]) {
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
    if (ref) {
      const value = referenceAt(ref.spectrum, s.wavenumber_cm1[idx[j]]);
      r.insertCell().textContent = value === null ? "—" : formatNumber(value, 4);
    }
    for (const e of extras) {
      const value = extraAt(e, s.wavenumber_cm1[idx[j]]);
      r.insertCell().textContent = value === null ? "—" : formatNumber(value, 4);
    }
  }
  host.replaceChildren(tab, ...(layers.marks ? marksTables(layers.marks) : []));
}
