// @ts-check
import { STORAGE_PREFIX } from "./appname.js";

/**
 * One loaded spectrum. The real file name never leaves the file panel and the tooltip; the header shows `code`.
 * @typedef {{ key: string, params: Record<string, string> }} Notice
 * @typedef {{ code: string, name: string | null, demo: boolean, points: number, fromCm1: number, toCm1: number, resolutionCm1: number | null, role: "sample" | "reference" | "residual" | "subtraction" | "mean", parent: string | null, note: string | null, warnings: Notice[] }} FileEntry
 * @typedef {{ id: string, name: string }} Offer
 * @typedef {{ supported: boolean, watching: boolean, folderName: string | null, saved: string | null, remember: boolean, auto: boolean, offers: Offer[], notice: Notice | null }} FolderState
 * @typedef {{ id: string, version: string, spectra: number, license: string, attribution: { it: string | null, en: string }, private: boolean, enabled: boolean }} LibraryEntry
 * @typedef {{ done: number, total: number, name: string }} LibraryJob
 * One comparison: `data` is the `ftir-risultato-confronto/1` document, `code` the spectrum it was run on, `sig` the libraries searched.
 * @typedef {{ code: string, data: any, sig: string }} MatchResult
 * The chemist's own mark on a candidate (memory only, never stored).
 * @typedef {"accept" | "unsure" | "reject"} ChemistLabel
 * @typedef {{ files: FileEntry[], active: string | null, fileError: Notice | null, libraries: LibraryEntry[], libraryJob: LibraryJob | null, libraryNotices: Notice[], results: Record<string, MatchResult>, matching: string | null, matchError: Notice | null, labels: Record<string, ChemistLabel>, selected: string | null, overlay: boolean, peaks: { explained: number, unexplained: number }, decision: null | { level: number }, folder: FolderState }} AppState
 */

/** @returns {AppState} */
export function emptyState() {
  return { files: [], active: null, fileError: null, libraries: [], libraryJob: null, libraryNotices: [], results: {}, matching: null, matchError: null, labels: {}, selected: null, overlay: false, peaks: { explained: 0, unexplained: 0 }, decision: null, folder: { supported: false, watching: false, folderName: null, saved: null, remember: false, auto: false, offers: [], notice: null } };
}

let state = emptyState();
/** @type {Set<(s: AppState) => void>} */
const listeners = new Set();

/** The spectrum shown: the active code, or the first one. @param {AppState} s @returns {FileEntry | undefined} */
export function activeFile(s) {
  return s.files.find((f) => f.code === s.active) ?? s.files[0];
}

/** The comparison of the spectrum shown, if it was run. @param {AppState} s @returns {MatchResult | null} */
export function resultOf(s) {
  const code = activeFile(s)?.code;
  return (code && s.results[code]) || null;
}

/** Key of a candidate in `labels` and `selected`. @param {{ library: string, spectrum_id: string }} c @returns {string} */
export function candidateKey(c) {
  return `${c.library}/${c.spectrum_id}`;
}

/** Libraries that take part in the comparison. @param {AppState} s @returns {LibraryEntry[]} */
export function activeLibraries(s) {
  return s.libraries.filter((l) => l.enabled);
}

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

/** Forget the whole analysis (and notify); the folder watch is a separate switch of the user and stays as it is. */
export function reset() {
  update({ ...emptyState(), folder: state.folder });
}

/** Preferences are the only thing stored in the browser, always under the product prefix. */
export const PREFS = ["lang", "theme", "panel", "shortcuts", "autoMatch"];

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
