// @ts-check
import { focusPatch } from "./tabs.js";

/**
 * Side-by-side view, as pure functions (no DOM): how many panes fit, and the patches that put a tab beside another, take it away or end the view.
 * `split.panes` is the ordered list of tab ids shown together; the focused tab is always one of them while the view is on.
 * @typedef {import("./state.js").AppState} AppState
 * @typedef {"left" | "right" | "top" | "bottom" | "center"} Side
 */

/** Most tabs shown at once. */
export const PANES_MAX = 4;

const TWO_EM = 45;
const WIDE_EM = 64;
const THREE_COLUMNS_EM = 100;

/**
 * The grid for `n` panes on a window `widthEm` wide: under 45em one pane is shown; up to 64em one column of at most two; wider, two panes in a row or a column as chosen,
 * three in three columns from 100em (else two above and one below), four in a 2×2 grid.
 * @param {number} n @param {"row" | "column"} orientation @param {number} widthEm
 * @returns {{ visible: number, cols: number, rows: number, orientation: "row" | "column" }}
 */
export function paneLayout(n, orientation, widthEm) {
  const count = Math.max(0, Math.min(Math.floor(n), PANES_MAX));
  if (count <= 1 || widthEm < TWO_EM) return { visible: Math.min(count, 1), cols: 1, rows: 1, orientation: "column" };
  if (widthEm < WIDE_EM) return { visible: Math.min(count, 2), cols: 1, rows: Math.min(count, 2), orientation: "column" };
  if (count === 2) return orientation === "column" ? { visible: 2, cols: 1, rows: 2, orientation } : { visible: 2, cols: 2, rows: 1, orientation: "row" };
  if (count === 3) return widthEm >= THREE_COLUMNS_EM ? { visible: 3, cols: 3, rows: 1, orientation: "row" } : { visible: 3, cols: 2, rows: 2, orientation: "row" };
  return { visible: 4, cols: 2, rows: 2, orientation: "row" };
}

/** The panes that are shown when only `visible` fit: a run of neighbours that contains the focused one. @param {string[]} panes @param {string | null} focus @param {number} visible @returns {string[]} */
export function visiblePanes(panes, focus, visible) {
  if (visible >= panes.length) return panes;
  const at = Math.max(0, panes.indexOf(focus ?? ""));
  const from = Math.min(at, panes.length - visible);
  return panes.slice(from, from + visible);
}

/** The view of a tab that is not focused, as a whole state for the modules that read `s.selected`, `s.active`… (read only). @param {AppState} s @param {import("./state.js").Tab} tab @returns {AppState} */
export function paneState(s, tab) {
  return { ...s, ...tab.view };
}

/** @param {Side} side @returns {"row" | "column"} */
const orientationOf = (side) => (side === "top" || side === "bottom" ? "column" : "row");

/**
 * Put a tab beside another one. `target` is the pane the side refers to (the focused one by default). Sides insert before or after it, `center` shows the tab in its place.
 * With four panes already, a side drop replaces the target instead. A tab already shown moves. Without a split a tab cannot sit beside itself: the nearest other tab is used.
 * @param {AppState} s @param {string} id @param {Side} side @param {string} [target] @returns {Partial<AppState>}
 */
export function splitPatch(s, id, side, target) {
  const active = s.split.panes.length >= 2;
  const base = active && target && s.split.panes.includes(target) ? target : s.focusTab;
  if (!base || !s.tabs.some((x) => x.id === id)) return {};
  let moved = id;
  if (moved === base) {
    const at = s.tabs.findIndex((x) => x.id === id);
    const other = s.tabs[at + 1] ?? s.tabs[at - 1];
    if (side === "center" || active || !other) return {};
    moved = other.id;
  }
  const current = active ? s.split.panes : [base];
  const replace = side === "center" || (!current.includes(moved) && current.length >= PANES_MAX);
  /** @type {string[]} */
  let next;
  if (replace) next = current.map((p) => (p === base ? moved : p === moved ? base : p));
  else {
    const rest = current.filter((p) => p !== moved);
    const after = side === "right" || side === "bottom" ? 1 : 0;
    const at = rest.indexOf(base) + after;
    next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  const split = { ...s.split, panes: next, orientation: side !== "center" && next.length <= 2 ? orientationOf(side) : s.split.orientation };
  const focus = next.includes(s.focusTab ?? "") ? {} : focusPatch(s, moved);
  return { ...focus, split };
}

/** Take a tab out of the side-by-side view (it stays open); below two panes the view ends. @param {AppState} s @param {string} id @returns {Partial<AppState>} */
export function unsplitPatch(s, id) {
  const panes = s.split.panes;
  const at = panes.indexOf(id);
  if (at < 0) return {};
  const next = panes.filter((p) => p !== id);
  const split = { ...s.split, panes: next.length < 2 ? [] : next };
  if (id !== s.focusTab) return { split };
  const near = next[Math.min(at, next.length - 1)];
  return { ...(near ? focusPatch(s, near) : {}), split };
}

/** End the side-by-side view: every tab stays open, the focused one is shown alone. @param {AppState} s @returns {Partial<AppState>} */
export function endSplitPatch(s) {
  return { split: { ...s.split, panes: [] } };
}

/**
 * The five drop zones over a rectangle: the outer quarter on each side is that side (left and right win in the corners), the middle shows the tab there.
 * @param {{ left: number, top: number, width: number, height: number }} r @param {number} x @param {number} y @returns {Side | null} null outside the rectangle
 */
export function dropSide(r, x, y) {
  const u = (x - r.left) / r.width;
  const v = (y - r.top) / r.height;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  if (u < 0.25) return "left";
  if (u > 0.75) return "right";
  return v < 0.25 ? "top" : v > 0.75 ? "bottom" : "center";
}
