// @ts-check
import { STORAGE_PREFIX } from "./appname.js";

/**
 * One loaded spectrum. The real file name never leaves the file panel and the tooltip; the header shows `code`.
 * @typedef {{ code: string, name: string | null, demo: boolean, points: number, fromCm1: number, toCm1: number, stepCm1: number, role: "sample" | "reference" | "residual" | "subtraction" | "mean", warnings: string[] }} FileEntry
 * @typedef {{ id: string, version: string, spectra: number }} LibraryEntry
 * @typedef {{ files: FileEntry[], libraries: LibraryEntry[], result: null | { level: number, alerts: number }, peaks: { explained: number, unexplained: number }, decision: null | { level: number } }} AppState
 */

/** @returns {AppState} */
function initial() {
  return { files: [], libraries: [], result: null, peaks: { explained: 0, unexplained: 0 }, decision: null };
}

let state = initial();
/** @type {Set<(s: AppState) => void>} */
const listeners = new Set();

/** The analysis state: in memory only, never stored. @returns {AppState} */
export function getState() {
  return state;
}

/** Merge a patch into the state and tell the subscribers. @param {Partial<AppState>} patch */
export function update(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

/** @param {(s: AppState) => void} fn @returns {() => void} unsubscribe */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Forget the whole analysis (and notify). */
export function reset() {
  update(initial());
}

/** Preferences are the only thing stored in the browser, always under the product prefix. */
export const PREFS = ["lang", "theme", "panel", "shortcuts"];

/** @param {string} name @returns {string | null} */
export function readPref(name) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + name);
  } catch {
    return null;
  }
}

/** @param {string} name @param {string} value */
export function writePref(name, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, value);
  } catch {
    // ignored: the choice just is not remembered
  }
}
