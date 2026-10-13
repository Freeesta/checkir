// @ts-check
import { formatNumber, t } from "./i18n.js";
import { drawPeaks, drawRegions, marksTables, svg } from "./chart_marks.js";
import { nearestIndex, thin, visibleIndices } from "./spectrum.js";
import { clamp, pan, zoom } from "./view.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./view.js").View} View */
/** Extra curves and zones drawn with the sample: the library spectrum of a candidate (already scaled) and the zone left out of the comparison.
 * @typedef {{ reference?: { spectrum: Spectrum, label: string, scale: number } | null, excluded?: { from: number, to: number, label: string } | null, marks?: import("./chart_marks.js").Marks | null }} Layers */

const W = 800;
const H = 360;
const M = { l: 56, r: 16, t: 12, b: 44 };
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

/**
 * Draw the chart into `host`: SVG with axes, ticks and the curve; x axis runs from high to low wavenumber.
 * @param {HTMLElement} host
 * @param {Spectrum} s
 * @param {View} v
 * @param {Layers} [layers]
 */
export function draw(host, s, v, layers = {}) {
  const idx = visibleIndices(s, v.min, v.max);
  const ref = layers.reference?.spectrum ?? null;
  const refIdx = ref ? visibleIndices(ref, v.min, v.max) : [];
  let y0 = 0;
  let y1 = -Infinity;
  for (const i of idx) {
    if (s.y[i] < y0) y0 = s.y[i];
    if (s.y[i] > y1) y1 = s.y[i];
  }
  for (const i of refIdx) {
    if (!Number.isFinite(ref?.y[i])) continue;
    if (/** @type {Spectrum} */ (ref).y[i] < y0) y0 = /** @type {Spectrum} */ (ref).y[i];
    if (/** @type {Spectrum} */ (ref).y[i] > y1) y1 = /** @type {Spectrum} */ (ref).y[i];
  }
  y1 = y1 > y0 ? (y1 - y0) * 1.05 + y0 : y0 + 1;
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
  drawExcluded(root, layers.excluded, v, px);
  if (layers.marks) drawRegions(root, layers.marks.regions, v, px, { top: M.t, height: H - M.t - M.b });
  root.append(svg("rect", { class: "axis", x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }));
  if (ref) {
    const kept = thin(refIdx.filter((i) => Number.isFinite(ref.y[i])), ref.y, PLOT_W);
    root.append(svg("polyline", { class: "curve-reference", points: kept.map((i) => `${px(ref.wavenumber_cm1[i])},${py(ref.y[i])}`).join(" ") }));
    const legend = svg("text", { class: "label reference-label", x: W - M.r - 6, y: M.t + 28, "text-anchor": "end" });
    legend.textContent = /** @type {{ label: string }} */ (layers.reference).label;
    root.append(legend);
  }
  root.append(svg("polyline", { class: "curve", points: thin(idx, s.y, PLOT_W).map((i) => `${px(s.wavenumber_cm1[i])},${py(s.y[i])}`).join(" ") }));
  if (layers.marks) drawPeaks(root, layers.marks.peaks, v, px, (x) => py(s.y[Math.max(0, nearestIndex(s, x))]));
  const ex = svg("text", { class: "label", x: W / 2, y: H - 6, "text-anchor": "middle" });
  ex.textContent = t("chart.axis_x");
  const ey = svg("text", { class: "label", x: 14, y: H / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${H / 2})` });
  ey.textContent = yLabel(s);
  root.append(ex, ey);
  host.replaceChildren(root);
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
  const idx = visibleIndices(s, v.min, v.max);
  const stride = Math.max(1, Math.ceil(idx.length / MAX_RIGHE));
  const tab = document.createElement("table");
  const cap = tab.createCaption();
  cap.textContent = ref ? `${t("table.caption")} ${t("table.reference_note", { label: ref.label, scale: formatNumber(ref.scale, 2) })}` : t("table.caption");
  const row = tab.createTHead().insertRow();
  for (const name of [t("table.wavenumber"), yLabel(s), ...(ref ? [t("table.reference")] : [])]) {
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
  }
  host.replaceChildren(tab, ...(layers.marks ? marksTables(layers.marks) : []));
}

/** @param {Spectrum} s @returns {View} the whole range of the spectrum */
function extentOf(s) {
  let min = Infinity;
  let max = -Infinity;
  for (const x of s.wavenumber_cm1) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { min, max };
}

/**
 * Wire the chart: keyboard (+ - arrows 0) and buttons, both without any drag. The spectrum is swapped with `set`; with none, a short line says so.
 * @param {{ chart: HTMLElement, toolbar: HTMLElement, tab: HTMLElement, range: HTMLElement }} el
 * @returns {{ redraw: () => void, set: (s: Spectrum | null) => void, setLayers: (l: Layers) => void }} `redraw` after a language change
 */
export function wire(el) {
  /** @type {Spectrum | null} */
  let s = null;
  /** @type {Layers} */
  let layers = {};
  let full = { min: 0, max: 1 };
  let v = { ...full };
  const update = () => {
    if (!s) {
      for (const host of [el.chart, el.tab]) host.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: t("chart.empty") }));
      el.range.textContent = "";
      return;
    }
    draw(el.chart, s, v, layers);
    table(el.tab, s, v, layers);
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
    if (!s) return;
    v = actions[i][2]();
    update();
  };
  const buttons = actions.map(([symbol], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = symbol;
    b.addEventListener("click", () => apply(i));
    return b;
  });
  const relabel = () => {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-label", actions[i][1]());
      b.title = actions[i][1]();
      b.disabled = !s;
    });
  };
  el.toolbar.replaceChildren(...buttons);
  el.chart.addEventListener("keydown", (e) => {
    const i = keys[/** @type {keyof typeof keys} */ (e.key)];
    if (i === undefined) return;
    e.preventDefault();
    apply(i);
  });
  relabel();
  update();
  return {
    redraw: () => {
      relabel();
      update();
    },
    setLayers: (next) => {
      layers = next;
      update();
    },
    set: (next) => {
      if (next !== s) {
        s = next;
        if (s) {
          full = extentOf(s);
          v = { ...full };
        }
      }
      relabel();
      update();
    },
  };
}
