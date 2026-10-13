// @ts-check
import { BRUSH_HEIGHT } from "./chart_ranges.js";
import { spanOf, zoomAt } from "./view.js";
import { t } from "./i18n.js";

/** @typedef {import("./view.js").View} View */
/** What the chart offers to its input handlers.
 * @typedef {{
 *   geom: () => (import("./chart_cursors.js").Geometry & { y0: number, y1: number }) | null,
 *   view: () => View,
 *   full: () => View,
 *   setView: (v: View, defer?: boolean) => void,
 *   cursors: ReturnType<typeof import("./chart_cursors.js").createCursors>,
 *   toggleLockY: () => void,
 *   isLocked: () => boolean,
 *   yZoom: (a: number, b: number) => void,
 *   yZoomBy: (factor: number) => void,
 *   announce: (text: string) => void,
 *   brush?: (from: number, to: number) => void,
 *   pickPeak?: (id: string) => boolean,
 *   snap?: (wn: number) => number,
 * }} ChartApi */

const DRAG_PX = 4;
const WHEEL_STEP = 1.25;
const PEAK_HIT_PX = 8;

/** A pointer position in the SVG user units and the part of the chart it is on: the plot, the x axis (below it) or the y axis (left of it). @typedef {{ x: number, y: number, zone: "plot" | "x" | "y" | "brush" | null }} Point */

/** @param {HTMLElement} host @param {ChartApi} api @param {{ clientX: number, clientY: number }} e @returns {Point | null} */
function pointOf(host, api, e) {
  const g = api.geom();
  const root = host.querySelector("svg");
  if (!g || !root) return null;
  const r = root.getBoundingClientRect();
  const x = ((e.clientX - r.left) * g.width) / r.width;
  const y = ((e.clientY - r.top) * g.height) / r.height;
  const inX = x >= g.left && x <= g.right;
  const inY = y >= g.top && y <= g.bottom;
  const strip = api.brush ? BRUSH_HEIGHT : 0;
  const below = inX && y > g.bottom && y <= g.height;
  return { x, y, zone: inX && inY ? "plot" : below && y <= g.bottom + strip ? "brush" : below ? "x" : inY && x < g.left && x >= 0 ? "y" : null };
}

/** Wavenumber at an SVG x, held inside the plot. @param {ChartApi} api @param {number} sx @returns {number} */
function wavenumberAt(api, sx) {
  const g = /** @type {NonNullable<ReturnType<ChartApi["geom"]>>} */ (api.geom());
  const v = api.view();
  const f = Math.min(1, Math.max(0, (sx - g.left) / (g.right - g.left)));
  return v.max - f * (v.max - v.min);
}

/** Value of y at an SVG y, held inside the plot. @param {ChartApi} api @param {number} sy @returns {number} */
function valueAtY(api, sy) {
  const g = /** @type {NonNullable<ReturnType<ChartApi["geom"]>>} */ (api.geom());
  const f = Math.min(1, Math.max(0, (g.bottom - sy) / (g.bottom - g.top)));
  return g.y0 + f * (g.y1 - g.y0);
}

/** The end of a drag that was not a click: a zoom of the x range, or of the y range when it started on the y axis. @param {ChartApi} api @param {Point} start @param {Point} end @param {number} dx @param {number} dy pointer travel in CSS pixels */
function finishDrag(api, start, end, dx, dy) {
  if (start.zone === "y") {
    if (Math.abs(dy) <= DRAG_PX) return;
    if (api.isLocked()) return api.announce(t("chart.y_locked_hint"));
    return api.yZoom(valueAtY(api, start.y), valueAtY(api, end.y));
  }
  if (Math.abs(dx) > DRAG_PX) api.setView(spanOf(api.full(), wavenumberAt(api, start.x), wavenumberAt(api, end.x)));
}

/** The pointer-up of a brush drag: a span of whole wavenumbers, or nothing for a click. @param {ChartApi} api @param {Point} start @param {Point} end @param {number} dx pointer travel in CSS pixels */
function endBrush(api, start, end, dx) {
  if (Math.abs(dx) <= DRAG_PX) return;
  const a = wavenumberAt(api, start.x);
  const b = wavenumberAt(api, end.x);
  api.brush?.(Math.round(Math.min(a, b)), Math.round(Math.max(a, b)));
}

/** The id of the peak marker within a few pixels of a click, the nearest one. @param {HTMLElement} host @param {{ clientX: number, clientY: number }} e @returns {string | null} */
function peakAt(host, e) {
  let best = null;
  let bestD = PEAK_HIT_PX;
  for (const m of host.querySelectorAll("[data-peak]")) {
    const r = m.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    if (d <= bestD) [best, bestD] = [m.getAttribute("data-peak"), d];
  }
  return best;
}

/** Pointer: moving shows the cursor line, a click places cursor 1 (Alt+click cursor 2), a drag in the plot or along an axis draws a zoom band (the y axis only when it is not locked), the wheel zooms around the pointer, a double click shows everything. @param {HTMLElement} host @param {ChartApi} api */
function attachPointer(host, api) {
  /** @type {{ start: Point, cx: number, cy: number, alt: boolean } | null} */
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    const p = e.button === 0 ? pointOf(host, api, e) : null;
    if (!p?.zone) return;
    drag = { start: p, cx: e.clientX, cy: e.clientY, alt: e.altKey };    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener("pointermove", (e) => {
    const p = pointOf(host, api, e);
    api.cursors.hover(p?.zone === "plot" ? wavenumberAt(api, p.x) : null);
    if (!drag || !p) return;
    if (drag.start.zone === "y" && Math.abs(e.clientY - drag.cy) > DRAG_PX) api.cursors.band("y", [drag.start.y, p.y]);
    else if (drag.start.zone !== "y" && Math.abs(e.clientX - drag.cx) > DRAG_PX) api.cursors.band("x", [wavenumberAt(api, drag.start.x), wavenumberAt(api, p.x)]);
  });
  host.addEventListener("pointerup", (e) => {
    const d = drag;
    drag = null;
    api.cursors.band(null);
    const p = pointOf(host, api, e);
    if (!d || !p) return;
    if (d.start.zone === "plot" && Math.abs(e.clientX - d.cx) <= DRAG_PX) {
      const peak = !e.shiftKey && Math.abs(e.clientY - d.cy) <= DRAG_PX ? peakAt(host, e) : null;
      if (peak && api.pickPeak?.(peak)) return;
      if (p.zone === "plot") api.cursors.set(d.alt ? 1 : 0, e.shiftKey && api.snap ? api.snap(wavenumberAt(api, p.x)) : wavenumberAt(api, p.x));
      return;
    }
    if (d.start.zone === "brush") return endBrush(api, d.start, p, e.clientX - d.cx);
    finishDrag(api, d.start, p, e.clientX - d.cx, e.clientY - d.cy);  });
  host.addEventListener("pointercancel", () => {
    drag = null;
    api.cursors.band(null);
  });
  host.addEventListener("pointerleave", () => api.cursors.hover(null));
  host.addEventListener("dblclick", () => api.setView({ ...api.full() }));
  host.addEventListener(
    "wheel",
    (e) => {
      const p = pointOf(host, api, e);
      if (!p?.zone) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      if (p.zone === "y") api.yZoomBy(factor);
      else api.setView(zoomAt(api.view(), api.full(), factor, wavenumberAt(api, p.x)), true);
    },
    { passive: false },
  );
}

/** Keys that work on the focused chart besides the zoom keys: `k` cursors, `,` `.` move the active cursor (Shift: 10 points), `y` locks the y axis, Shift+↑ ↓ zoom the y axis, Esc clears the cursors. @param {HTMLElement} host @param {ChartApi} api */
function attachKeys(host, api) {
  host.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const step = { ",": -1, ".": 1, "<": -10, ">": 10 }[/** @type {string} */ (e.key)];
    if (step !== undefined) api.cursors.step(step, api.view());
    else if (e.key === "k") api.cursors.cycle((api.view().min + api.view().max) / 2);
    else if (e.key === "y") api.toggleLockY();
    else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) api.yZoomBy(e.key === "ArrowUp" ? 0.5 : 2);
    else if (e.key === "Escape" && api.cursors.any()) api.cursors.clear();
    else return;
    e.preventDefault();
  });
}

/** @param {HTMLElement} host @param {ChartApi} api */
export function attachInput(host, api) {
  attachPointer(host, api);
  attachKeys(host, api);
}

/** The wavenumber under a mouse event, or null when it is not over the plot. @param {HTMLElement} host @param {ChartApi} api @param {MouseEvent} e @returns {number | null} */
export function clientWavenumber(host, api, e) {
  const p = pointOf(host, api, e);
  return p?.zone === "plot" ? wavenumberAt(api, p.x) : null;
}
