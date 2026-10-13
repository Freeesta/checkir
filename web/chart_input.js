// @ts-check
import { spanOf, zoomAt } from "./view.js";

/** @typedef {import("./view.js").View} View */
/** What the chart offers to its input handlers.
 * @typedef {{
 *   geom: () => import("./chart_cursors.js").Geometry | null,
 *   view: () => View,
 *   full: () => View,
 *   setView: (v: View, defer?: boolean) => void,
 *   cursors: ReturnType<typeof import("./chart_cursors.js").createCursors>,
 *   toggleLockY: () => void,
 * }} ChartApi */

const DRAG_PX = 4;
const WHEEL_STEP = 1.25;

/** Wavenumber under a pointer event, or null outside the plot area. @param {HTMLElement} host @param {ChartApi} api @param {{ clientX: number }} e @returns {number | null} */
function wavenumberAt(host, api, e) {
  const g = api.geom();
  const root = host.querySelector("svg");
  if (!g || !root) return null;
  const r = root.getBoundingClientRect();
  const x = ((e.clientX - r.left) * g.width) / r.width;
  if (x < g.left || x > g.right) return null;
  const v = api.view();
  return v.max - ((x - g.left) / (g.right - g.left)) * (v.max - v.min);
}

/** Pointer: moving shows the cursor line, a click places cursor 1 (Alt+click cursor 2), a drag draws the zoom box, the wheel zooms around the pointer, a double click shows the whole spectrum. @param {HTMLElement} host @param {ChartApi} api */
function attachPointer(host, api) {
  /** @type {{ x: number, wn: number } | null} */
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    const wn = e.button === 0 ? wavenumberAt(host, api, e) : null;
    if (wn === null) return;
    drag = { x: e.clientX, wn };
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener("pointermove", (e) => {
    const wn = wavenumberAt(host, api, e);
    api.cursors.hover(wn);
    if (drag && wn !== null && Math.abs(e.clientX - drag.x) > DRAG_PX) api.cursors.box([drag.wn, wn]);
  });
  host.addEventListener("pointerup", (e) => {
    const start = drag;
    drag = null;
    api.cursors.box(null);
    const wn = wavenumberAt(host, api, e);
    if (!start || wn === null) return;
    if (Math.abs(e.clientX - start.x) > DRAG_PX) api.setView(spanOf(api.full(), start.wn, wn));
    else api.cursors.set(e.altKey ? 1 : 0, wn);
  });
  host.addEventListener("pointercancel", () => {
    drag = null;
    api.cursors.box(null);
  });
  host.addEventListener("pointerleave", () => api.cursors.hover(null));
  host.addEventListener("dblclick", () => api.setView({ ...api.full() }));
  host.addEventListener(
    "wheel",
    (e) => {
      const wn = wavenumberAt(host, api, e);
      if (wn === null) return;
      e.preventDefault();
      api.setView(zoomAt(api.view(), api.full(), e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP, wn), true);
    },
    { passive: false },
  );
}

/** Keys that work on the focused chart besides the zoom keys: `k` cursors, `,` `.` move the active cursor (Shift: 10 points), `y` locks the y axis, Esc clears the cursors. @param {HTMLElement} host @param {ChartApi} api */
function attachKeys(host, api) {
  host.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const step = { ",": -1, ".": 1, "<": -10, ">": 10 }[/** @type {string} */ (e.key)];
    if (step !== undefined) api.cursors.step(step, api.view());
    else if (e.key === "k") api.cursors.cycle((api.view().min + api.view().max) / 2);
    else if (e.key === "y") api.toggleLockY();
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
