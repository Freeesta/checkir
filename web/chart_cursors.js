// @ts-check
import { formatNumber, t } from "./i18n.js";
import { svg } from "./chart_marks.js";
import { nearestIndex } from "./spectrum.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** Plot area and mappings of the last drawn chart (SVG user units).
 * @typedef {{ left: number, right: number, top: number, bottom: number, width: number, height: number, px: (x: number) => number, py: (y: number) => number }} Geometry */
/** @typedef {{ hover: SVGElement, line: SVGElement[], tag: SVGElement[], read: SVGElement[], box: SVGElement, ybox: SVGElement }} Layer */
/** What the layer shows: wavenumbers of cursor 1 and 2, the one under the pointer and the zoom box.
 * @typedef {{ pos: Array<number | null>, hover: number | null, band: { kind: "x" | "y", range: [number, number] } | null }} Shown */

/** @param {Spectrum} s @returns {string} */
const unitOf = (s) => (s.y_unit === undefined || s.y_unit === "Absorbance" ? t("chart.unit_abs") : t("chart.unit_other"));

/** @param {Spectrum} s @param {number} x @returns {string} position and value at the nearest point */
function readPoint(s, x) {
  return t("chart.reading_point", { x: formatNumber(x, 1), unit: unitOf(s), y: formatNumber(s.y[nearestIndex(s, x)], 3) });
}

/** @param {Spectrum} s @param {number} a @param {number} b @returns {string} difference of position and value between two cursors */
function readDelta(s, a, b) {
  const dy = s.y[nearestIndex(s, b)] - s.y[nearestIndex(s, a)];
  return t("chart.reading_delta", { dx: formatNumber(Math.abs(b - a), 1), unit: unitOf(s), dy: formatNumber(Math.abs(dy), 3) });
}

/** Build the group inside a freshly drawn chart. Cursor 1 is a solid line, cursor 2 a dashed one. @param {Geometry} g @returns {{ group: SVGElement, layer: Layer }} */
function buildLayer(g) {
  const vline = (/** @type {string} */ cls) => svg("line", { class: cls, y1: g.top, y2: g.bottom });
  const text = (/** @type {Record<string, string | number>} */ a) => svg("text", { class: "label cursor-text", ...a });
  /** @type {Layer} */
  const layer = {
    hover: vline("cursor-hover"),
    line: [vline("cursor cursor-1"), vline("cursor cursor-2")],
    tag: [text({ y: g.top + 12 }), text({ y: g.top + 12 })],
    read: [text({ x: g.right, y: 13, "text-anchor": "end" }), text({ x: g.right, y: 27, "text-anchor": "end" })],
    box: svg("rect", { class: "zoom-box", y: g.top, height: g.bottom - g.top }),
    ybox: svg("rect", { class: "zoom-box", x: g.left, width: g.right - g.left }),
  };
  layer.tag[0].textContent = "1";
  layer.tag[1].textContent = "2";
  const group = svg("g", { class: "cursors", "aria-hidden": "true" });
  group.append(svg("rect", { class: "axis-hit-x", x: g.left, y: g.bottom, width: g.right - g.left, height: g.height - g.bottom }), svg("rect", { class: "axis-hit-y", x: 0, y: g.top, width: g.left, height: g.bottom - g.top }), layer.box, layer.ybox, layer.hover, ...layer.line, ...layer.tag, ...layer.read);
  return { group, layer };
}

/** Show a vertical line at a wavenumber, or hide it when it is outside the plot. @param {SVGElement} line @param {Geometry} g @param {number | null} x @returns {boolean} shown */
function placeLine(line, g, x) {
  const inside = x !== null && g.px(x) >= g.left && g.px(x) <= g.right;
  line.style.display = inside ? "" : "none";
  if (!inside) return false;
  const at = String(g.px(/** @type {number} */ (x)));
  line.setAttribute("x1", at);
  line.setAttribute("x2", at);
  return true;
}

/** Set the attributes of the layer from what it shows: no layout, just attributes and text. @param {Layer} layer @param {Geometry} g @param {Spectrum} s @param {Shown} st */
function paintLayer(layer, g, s, st) {
  placeLine(layer.hover, g, st.hover);
  for (const i of [0, 1]) {
    const shown = placeLine(layer.line[i], g, st.pos[i]);
    layer.tag[i].style.display = shown ? "" : "none";
    if (shown) layer.tag[i].setAttribute("x", String(g.px(/** @type {number} */ (st.pos[i])) + 3));
  }
  const first = st.pos[0] ?? st.hover;
  const [a, b] = st.pos;
  layer.read[0].textContent = first === null ? "" : readPoint(s, first);
  layer.read[1].textContent = a !== null && b !== null ? readDelta(s, a, b) : "";
  const band = st.band;
  layer.box.style.display = band?.kind === "x" ? "" : "none";
  layer.ybox.style.display = band?.kind === "y" ? "" : "none";
  if (!band) return;
  const [lo, hi] = band.kind === "x" ? band.range.map((w) => g.px(w)) : band.range;
  const rect = band.kind === "x" ? layer.box : layer.ybox;
  rect.setAttribute(band.kind === "x" ? "x" : "y", String(Math.min(lo, hi)));
  rect.setAttribute(band.kind === "x" ? "width" : "height", String(Math.abs(lo - hi)));
}

/**
 * The two reading cursors and the zoom box. They live in one SVG group rebuilt with every redraw; moving them only sets attributes
 * (one repaint per frame), so nothing is laid out while the pointer moves.
 * @param {(text: string) => void} announce spoken only when a cursor is placed, never while it moves
 */
export function createCursors(announce) {
  /** @type {Shown} */
  const st = { pos: [null, null], hover: null, band: null };
  let active = 0;
  let frame = 0;
  let layer = /** @type {Layer | null} */ (null);
  let s = /** @type {Spectrum | null} */ (null);
  let geom = /** @type {Geometry | null} */ (null);
  const paint = () => {
    frame = 0;
    if (layer && s && geom) paintLayer(layer, geom, s, st);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  /** Put cursor `i` at wavenumber `x` and tell it (this is the release). @param {number} i @param {number} x */
  function set(i, x) {
    st.pos[i] = x;
    active = i;
    schedule();
    const [a, b] = st.pos;
    const sp = /** @type {Spectrum} */ (s);
    announce(a !== null && b !== null ? `${readPoint(sp, a)}; ${readPoint(sp, b)}; ${readDelta(sp, a, b)}` : readPoint(sp, x));
  }
  const clear = () => {
    st.pos = [null, null];
    st.hover = null;
    active = 0;
    schedule();
  };

  return {
    /** @param {SVGElement} root @param {Geometry} g @param {Spectrum} spectrum */
    mount(root, g, spectrum) {
      s = spectrum;
      geom = g;
      const built = buildLayer(g);
      layer = built.layer;
      root.append(built.group);
      paint();
    },
    set,
    clear,
    /** @param {number | null} x */
    hover(x) {
      st.hover = x;
      schedule();
    },
    /** The zoom band being dragged: wavenumbers for "x", SVG y values for "y", or none. @param {"x" | "y" | null} kind @param {[number, number]} [range] */
    band(kind, range) {
      st.band = kind && range ? { kind, range } : null;
      schedule();
    },
    /** @returns {boolean} some cursor is shown */
    any: () => st.pos[0] !== null || st.pos[1] !== null,
    /** The `k` key: cursor 1 at `centre`, then cursor 2, then both away. @param {number} centre */
    cycle(centre) {
      if (st.pos[0] === null) set(0, centre);
      else if (st.pos[1] === null) set(1, centre);
      else clear();
    },
    /** Step the active cursor by `n` data points towards the right of the screen (lower wavenumber) when n > 0. @param {number} n @param {{ min: number, max: number }} view */
    step(n, view) {
      const x = st.pos[active];
      if (!s || x === null) return;
      const xs = s.wavenumber_cm1;
      const asc = xs[xs.length - 1] >= xs[0];
      const i = Math.min(xs.length - 1, Math.max(0, nearestIndex(s, x) + (asc ? -n : n)));
      if (xs[i] >= view.min && xs[i] <= view.max) set(active, xs[i]);
    },
  };
}
