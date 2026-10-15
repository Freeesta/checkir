// @ts-check
import { emptyView, VIEW_FIELDS } from "./state.js";

/**
 * Open tabs, as pure functions: each one takes the state and returns the patch to hand to `update`. The view fields (`VIEW_FIELDS`) stay at the top of the state and
 * belong to the focused tab; changing the focus saves them in the tab that loses it and restores those of the one that gains it, in one patch.
 * @typedef {import("./state.js").AppState} AppState
 * @typedef {import("./state.js").Tab} Tab
 */

export const TABS_MAX = 20;
export const SHEETS_MAX = 20;

/** The root sample a spectrum comes from (residuals point to their parent). @param {AppState} s @param {string} code @returns {string} */
export function rootOf(s, code) {
  let at = code;
  for (let guard = 0; guard < 1000; guard++) {
    const parent = s.files.find((f) => f.code === at)?.parent;
    if (!parent) break;
    at = parent;
  }
  return at;
}

/** The file tab a spectrum (a root or a residual) belongs to. @param {AppState} s @param {string} code @returns {Tab | undefined} */
export function tabOfCode(s, code) {
  const root = rootOf(s, code);
  return s.tabs.find((t) => t.kind === "file" && t.code === root);
}

/** @param {AppState} s @returns {Tab | undefined} */
export function focusedTab(s) {
  return s.tabs.find((t) => t.id === s.focusTab);
}

/** @param {AppState} s @param {Tab} tab @returns {string[]} the codes of a file tab: its root and the derived spectra */
export function codesOf(s, tab) {
  return tab.kind === "file" && tab.code ? s.files.filter((f) => rootOf(s, f.code) === tab.code).map((f) => f.code) : [];
}

/** @param {AppState} s @returns {Partial<AppState>} */
function viewOf(s) {
  return Object.fromEntries(VIEW_FIELDS.map((k) => [k, s[k]]));
}

/** @param {AppState} s @returns {boolean} whether another file tab fits */
export function canOpenFile(s) {
  return s.tabs.filter((t) => t.kind === "file").length < TABS_MAX;
}

/** @param {AppState} s @returns {boolean} whether another substance tab fits */
export function canOpenSheet(s) {
  return s.tabs.filter((t) => t.kind === "sheet").length < SHEETS_MAX;
}

/** Points held in memory by all the spectra, roots and residuals. @param {AppState} s @returns {number} */
export function pointsInMemory(s) {
  return s.files.reduce((n, f) => n + f.points, 0);
}

/** The saved `active` of a tab if it is still one of its spectra, else its root. @param {AppState} s @param {Tab} tab @param {Partial<AppState>} view @returns {string | null} */
function activeOf(s, tab, view) {
  const codes = codesOf(s, tab);
  return typeof view.active === "string" && codes.includes(view.active) ? view.active : tab.code;
}

/**
 * Give the focus to a tab (optionally showing one of its spectra): the view of the tab that had it is saved, the view of the new one comes back.
 * The candidate × region table of the tab that loses the focus is dropped (it is rebuilt when the tab is shown again).
 * @param {AppState} s @param {string} id @param {string} [code] @returns {Partial<AppState>}
 */
export function focusPatch(s, id, code) {
  const next = s.tabs.find((t) => t.id === id);
  if (!next) return {};
  const leaving = focusedTab(s);
  if (leaving && leaving.id === id) return code && codesOf(s, next).includes(code) ? { active: code } : {};
  const tabs = s.tabs.map((t) => (leaving && t.id === leaving.id ? { ...t, view: viewOf(s) } : t));
  const patch = /** @type {Partial<AppState>} */ ({ tabs, focusTab: id, talk: false });
  if (leaving) {
    const gone = new Set(codesOf(s, leaving));
    patch.rangeTable = Object.fromEntries(Object.entries(s.rangeTable).filter(([c]) => !gone.has(c)));
  }
  if (next.kind === "sheet") return patch;
  const view = next.view ?? emptyView(next.code);
  Object.assign(patch, view, { active: code && codesOf(s, next).includes(code) ? code : activeOf(s, next, view) });
  return patch;
}

/** A new file tab at the end, with the focus. The state must already hold the file. @param {AppState} s @param {string} code @returns {Partial<AppState>} */
export function openFilePatch(s, code) {
  const tab = /** @type {Tab} */ ({ id: code, kind: "file", code, sheet: null, view: null });
  return focusPatch({ ...s, tabs: [...s.tabs, tab] }, code, code);
}

/** Close a tab: the focus goes to the neighbour on the right, else on the left; below two panes the side-by-side view ends. @param {AppState} s @param {string} id @returns {Partial<AppState>} */
export function closePatch(s, id) {
  const at = s.tabs.findIndex((t) => t.id === id);
  if (at < 0) return {};
  const tabs = s.tabs.filter((t) => t.id !== id);
  const panes = s.split.panes.filter((p) => p !== id);
  const split = { ...s.split, panes: panes.length < 2 ? [] : panes };
  if (s.focusTab !== id) return { tabs, split };
  const near = tabs[at] ?? tabs[at - 1];
  if (!near) return { tabs, split, focusTab: null, ...emptyView(null) };
  return { ...focusPatch({ ...s, tabs, focusTab: null }, near.id), split };
}

/** Move a tab to a position (0-based, kept inside the bar). @param {AppState} s @param {string} id @param {number} to @returns {Partial<AppState>} */
export function movePatch(s, id, to) {
  const from = s.tabs.findIndex((t) => t.id === id);
  if (from < 0) return {};
  const tabs = [...s.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, tab);
  return { tabs };
}

/** Show a spectrum: inside the focused tab only `active` changes, else the tab it belongs to gets the focus. @param {AppState} s @param {string} code @returns {Partial<AppState>} */
export function syncActive(s, code) {
  const own = tabOfCode(s, code);
  if (!own) return { active: code };
  return own.id === s.focusTab ? { active: code } : focusPatch(s, own.id, code);
}
