// @ts-check
import { draw, table } from "./chart.js";
import { attachMenu } from "./chart_menu.js";
import { createCursors } from "./chart_cursors.js";
import { attachInput } from "./chart_input.js";
import { formatNumber, t } from "./i18n.js";
import { clamp, pan, zoom } from "./view.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./view.js").View} View */
/** @typedef {import("./chart.js").Layers} Layers */

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

/** Toolbar buttons from [symbol, label, run] triples. @param {Array<[string, () => string, () => void]>} defs @returns {{ buttons: HTMLButtonElement[], relabel: (enabled: boolean) => void }} */
function makeButtons(defs) {
  const buttons = defs.map(([symbol, , run]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = symbol;
    b.addEventListener("click", run);
    return b;
  });
  return {
    buttons,
    relabel(enabled) {
      buttons.forEach((b, i) => {
        const name = defs[i][1]();
        b.setAttribute("aria-label", name);
        b.title = name;
        b.disabled = !enabled;
      });
    },
  };
}

/** Table, range line and empty message that go with the chart. @param {{ chart: HTMLElement, tab: HTMLElement, range: HTMLElement }} el @param {Spectrum | null} s @param {View} v @param {Layers} layers */
function showTable(el, s, v, layers) {
  if (!s) {
    for (const host of [el.chart, el.tab]) host.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: t("chart.empty") }));
    el.range.textContent = "";
    return;
  }
  table(el.tab, s, v, layers);
  el.range.textContent = t("chart.range", { from: formatNumber(v.min), to: formatNumber(v.max) });
}

/** A view from another chart: the same left edge and width, kept inside this spectrum. @param {View} r @param {View} full @returns {View} */
function fitView(r, full) {
  return clamp({ min: r.min, max: r.min + Math.min(r.max - r.min, full.max - full.min) }, full);
}

/** The five view moves (label and target view) and the keys that run them. @param {() => View} view @param {() => View} full @returns {{ moves: Array<[string, () => string, () => View]>, keys: Record<string, number> }} */
function viewMoves(view, full) {
  return {
    moves: [
      ["+", () => t("chart.zoom_in"), () => zoom(view(), full(), 0.5)],
      ["−", () => t("chart.zoom_out"), () => zoom(view(), full(), 2)],
      ["←", () => t("chart.pan_left"), () => pan(view(), full(), -0.25)],
      ["→", () => t("chart.pan_right"), () => pan(view(), full(), 0.25)],
      ["0", () => t("chart.reset"), () => clamp({ ...full() }, full())],
    ],
    keys: { "+": 0, "=": 0, "-": 1, ArrowLeft: 2, ArrowRight: 3, "0": 4 },
  };
}

/** The view moved so that the picked peak is inside it. @param {Layers} layers @param {View} v @param {View} full @returns {View} */
function withPeakInView(layers, v, full) {
  const at = layers.marks?.peaks.find((p) => p.focus)?.x;
  if (at === undefined || (at >= v.min && at <= v.max)) return v;
  return clamp({ min: at - (v.max - v.min) / 2, max: at + (v.max - v.min) / 2 }, full);
}

/** With the peaks shown, ← → pick the previous / next peak (Shift+← → still pans) and ↑ ↓ change the level of the card text, Esc clears the pick. @param {KeyboardEvent} e @param {{ step: (dir: 1 | -1) => boolean, clear: () => boolean, level: (dir: 1 | -1) => boolean }} peaks @returns {boolean} true when the key was used */
function peakKey(e, peaks) {
  if (e.key === "Escape") return peaks.clear();
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") return peaks.level(e.key === "ArrowUp" ? -1 : 1);
  return e.key === "ArrowRight" ? peaks.step(1) : e.key === "ArrowLeft" ? peaks.step(-1) : false;
}

/** The points of a spectrum inside a view as CSV text, numbers in the machine form (dot decimal). Only the sample's own data: nothing of a library. @param {Spectrum} s @param {View} v @returns {string} */
export function tableCsv(s, v) {
  const rows = [`wavenumber_cm1,${s.y_unit === "Transmittance" ? "transmittance" : s.y_unit === undefined || s.y_unit === "Absorbance" ? "absorbance" : "intensity"}`];
  s.wavenumber_cm1.forEach((x, i) => {
    if (x >= v.min && x <= v.max) rows.push(`${x},${s.y[i]}`);
  });
  return rows.join("\n") + "\n";
}

/** Offer a text as a local download (nothing leaves the browser). @param {string} name @param {string} text */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The zoom and pan keys of the focused chart; the peak keys come first when they are on. @param {HTMLElement} host @param {Record<string, number>} keys @param {(i: number) => void} run @param {(e: KeyboardEvent) => boolean} peakKeys */
function attachViewKeys(host, keys, run, peakKeys) {
  host.addEventListener("keydown", (e) => {
    if (peakKeys(e)) return e.preventDefault();
    const i = keys[e.key];
    if (i === undefined) return;
    e.preventDefault();
    run(i);
  });
}

/** @typedef {{ y0: number, y1: number }} YRange */

/** The y axis of the chart: automatic, zoomed on a range (cleared when the whole view returns) or locked by the person. @param {(text: string) => void} say */
function createYAxis(say) {
  let lock = /** @type {YRange | null} */ (null);
  let zoomed = /** @type {YRange | null} */ (null);
  return {
    range: () => lock ?? zoomed,
    locked: () => lock !== null,
    clear: () => ((lock = null), (zoomed = null)),
    clearZoom: () => (zoomed = null),
    /** @param {YRange} now the range on screen @returns {boolean} locked */
    toggle(now) {
      lock = lock ? null : { ...now };
      say(lock ? t("chart.y_locked") : t("chart.y_unlocked"));
      return lock !== null;
    },
    /** @param {number} a @param {number} b */
    zoomTo(a, b) {
      if (!lock && Math.abs(a - b) > 1e-12) zoomed = { y0: Math.min(a, b), y1: Math.max(a, b) };
    },
    /** @param {YRange} now @param {number} factor */
    zoomBy(now, factor) {
      if (lock) return;
      const half = ((now.y1 - now.y0) / 2) * factor;
      const mid = (now.y0 + now.y1) / 2;
      zoomed = { y0: mid - half, y1: mid + half };
    },
  };
}

/** Remember the view being left (at most 10); the many steps of one wheel turn count as one. @param {{ views: View[], at: number }} past @param {View} v @param {boolean} burst */
function remember(past, v, burst) {
  const now = Date.now();
  if (burst && now - past.at < 500) return void (past.at = now);
  past.at = now;
  const last = past.views[past.views.length - 1];
  if (last && last.min === v.min && last.max === v.max) return;
  past.views.push({ ...v });
  if (past.views.length > 10) past.views.shift();
}

/** The menu's view of the chart. @param {{ has: () => boolean, back: () => unknown, view: () => View, full: () => View, setView: (v: View) => void, y: ReturnType<typeof createYAxis>, cursors: ReturnType<typeof createCursors>, toggleLockY: () => void, lockButton: HTMLElement, csv: () => void }} c @returns {import("./chart_menu.js").MenuChart} */
function menuChart(c) {
  const centre = () => (c.view().min + c.view().max) / 2;
  return {
    hasSpectrum: c.has,
    back: c.back,
    zoomOut: () => c.setView(zoom(c.view(), c.full(), 2)),
    showAll: () => c.setView({ ...c.full() }),
    resetAll: () => (c.y.clear(), c.lockButton.setAttribute("aria-pressed", "false"), c.cursors.clear(), c.setView({ ...c.full() })),
    toggleLockY: c.toggleLockY,
    isLocked: c.y.locked,
    toggleCursors: () => (c.cursors.any() ? c.cursors.clear() : c.cursors.cycle(centre())),
    cursorsOn: c.cursors.any,
    exportTable: c.csv,
  };
}

/**
 * Wire the chart: keyboard (+ - arrows 0 and the cursor keys), pointer (cursors, zoom bands on the plot and the axes, wheel, double click), the menu and the buttons.
 * The spectrum is swapped with `set`; with none, a short line says so. With `link`, the x axis follows the other charts joined to the same link.
 * @param {{ chart: HTMLElement, toolbar: HTMLElement, tab: HTMLElement, range: HTMLElement }} el
 * @param {{ announce?: (text: string) => void, link?: ReturnType<typeof import("./view_link.js").createViewLink>, onBrush?: (from: number, to: number) => void, peaks?: { step: (dir: 1 | -1) => boolean, clear: () => boolean, level: (dir: 1 | -1) => boolean }, ctx?: import("./actions.js").Ctx, codeOf?: () => string | null }} [opts]
 * @returns {{ back: () => unknown, redraw: () => void, set: (s: Spectrum | null) => void, setLayers: (l: Layers) => void, cursorRange: () => [number, number] | null }} `redraw` after a language change
 */
export function wire(el, opts = {}) {
  const say = opts.announce ?? (() => {});
  const cursors = createCursors(say);
  const y = createYAxis(say);
  /** @type {Spectrum | null} */
  let s = null;
  /** @type {Layers} */
  let layers = {};
  let full = { min: 0, max: 1 };
  let v = { ...full };
  let geom = /** @type {(import("./chart_cursors.js").Geometry & { y0: number, y1: number }) | null} */ (null);
  let frame = 0;
  const past = /** @type {{ views: View[], at: number }} */ ({ views: [], at: 0 });
  const update = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    geom = s ? draw(el.chart, s, v, layers, { yLock: y.range(), cursors }) : null;
    showTable(el, s, v, layers);
  };
  const publish = opts.link ? opts.link.join((r) => ((v = fitView(r, full)), update())) : () => {};
  /** @param {View} next @param {boolean} [defer] one redraw per frame while the wheel turns */
  const setView = (next, defer = false) => {
    if (!s) return;
    remember(past, v, defer);
    v = next;
    if (v.min <= full.min && v.max >= full.max) y.clearZoom();
    publish(v);
    if (!defer) update();
    else if (!frame) frame = requestAnimationFrame(update);
  };
  const toggleLockY = () => {
    if (!s || !geom) return;
    lockButton.setAttribute("aria-pressed", String(y.toggle(geom)));
    update();
  };
  const centre = () => (v.min + v.max) / 2;
  const { moves, keys } = viewMoves(() => v, () => full);
  const { buttons, relabel } = makeButtons([
    ...moves.map(([sym, label, to]) => /** @type {[string, () => string, () => void]} */ ([sym, label, () => setView(to())])),
    ["⌖", () => t("chart.cursors"), () => cursors.cycle(centre())],
    ["⇕", () => t("chart.lock_y"), toggleLockY],
  ]);
  const lockButton = buttons[buttons.length - 1];
  lockButton.setAttribute("aria-pressed", "false");
  const refresh = () => relabel(s !== null);
  el.toolbar.replaceChildren(...buttons);
  attachViewKeys(el.chart, keys, (i) => setView(moves[i][2]()), (e) => layers.marks !== undefined && opts.peaks !== undefined && peakKey(e, opts.peaks));
  const input = {
    geom: () => geom, view: () => v, full: () => full, setView, cursors, toggleLockY, isLocked: y.locked, announce: say, brush: opts.onBrush,
    yZoom: (/** @type {number} */ a, /** @type {number} */ b) => (y.zoomTo(a, b), update()),
    yZoomBy: (/** @type {number} */ f) => geom && (y.zoomBy(geom, f), update()),
  };
  attachInput(el.chart, input);
  const back = () => past.views.length && ((v = /** @type {View} */ (past.views.pop())), update());
  if (opts.ctx) attachMenu(el.chart, menuChart({ has: () => s !== null, back, view: () => v, full: () => full, setView, y, cursors, toggleLockY, lockButton, csv: () => s && download(`${opts.codeOf?.() ?? "spectrum"}.csv`, tableCsv(s, v)) }), opts.ctx);
  refresh();
  update();
  return {
    back,
    cursorRange: () => cursors.pair(),
    redraw: () => (refresh(), update()),
    setLayers: (next) => ((layers = next), (v = withPeakInView(next, v, full)), update()),
    set: (next) => {
      if (next !== s) {
        s = next;
        y.clear();
        lockButton.setAttribute("aria-pressed", "false");
        cursors.clear();
        past.views = [];
        if (s) {
          full = extentOf(s);
          v = { ...full };
        }
      }
      refresh();
      update();
    },
  };
}
