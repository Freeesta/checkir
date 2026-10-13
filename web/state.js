// @ts-check
import { STORAGE_PREFIX } from "./appname.js";

/**
 * One loaded spectrum. The real file name never leaves the file panel and the tooltip; the header shows `code`.
 * @typedef {{ key: string, params: Record<string, string> }} Notice
 * What a residual was made from: the reference (its name and library) and the factor k used.
 * @typedef {{ name: string, library: string, k: number }} Derived
 * The open guided subtraction (memory only): the spectrum it works on, the chosen reference, the factor now shown and the one proposed.
 * @typedef {{ sample: string, library: string, spectrumId: string, name: string, k: number, proposed: number, max: number }} Subtraction
 * @typedef {{ code: string, name: string | null, demo: boolean, points: number, fromCm1: number, toCm1: number, resolutionCm1: number | null, sampling: string, role: "sample" | "reference" | "residual" | "subtraction" | "mean", parent: string | null, note: string | null, derived: Derived | null, warnings: Notice[] }} FileEntry
 * A compound recalled from a library to look at beside the sample, and how the recalled ones are shown (memory only).
 * @typedef {{ library: string, spectrumId: string, form: string }} Recalled
 * @typedef {{ refs: Recalled[], mode: "overlay" | "offset" | "difference", scale: "raw" | "max" | "area" | "lsq", offset: number, current: number }} RecallState
 * @typedef {{ id: string, name: string }} Offer
 * @typedef {{ supported: boolean, watching: boolean, folderName: string | null, saved: string | null, remember: boolean, auto: boolean, offers: Offer[], notice: Notice | null }} FolderState
 * @typedef {{ id: string, version: string, spectra: number, license: string, attribution: { it: string | null, en: string }, private: boolean, enabled: boolean, sampling: string | null }} LibraryEntry
 * @typedef {{ done: number, total: number, name: string }} LibraryJob
 * One comparison: `data` is the `ftir-risultato-confronto/1` document, `code` the spectrum it was run on, `sig` the libraries searched.
 * @typedef {{ code: string, data: any, sig: string }} MatchResult
 * The chemist's own mark on a candidate (memory only, never stored).
 * @typedef {"accept" | "unsure" | "reject"} ChemistLabel
 * The chemist's decision on one spectrum: level 1–5 and the chosen candidates (keys), valid for the libraries searched (`sig`). Memory only; the sheet is never stored.
 * @typedef {{ level: number, keys: string[] }} DecisionDraft
 * @typedef {{ level: number, keys: string[], sig: string }} Decision
 * The region of the comparison (a preset or ranges chosen by hand), an error to show next to its fields, and the candidate × region table per spectrum (`sig` = libraries and choice it was made for). Memory only.
 * @typedef {{ preset: string | null, ranges: Array<[number, number]> }} RangeChoice
 * @typedef {{ sig: string, columns: Array<{ id: string, ranges: Array<[number, number]> }>, cells: Record<string, Record<string, number | null>>, busy: boolean }} RangeTable
 * The three levels of the explanation texts, and a rule window shown on the chart from the peak card (memory only).
 * @typedef {"counsellor" | "chemist" | "teaching"} TextLevel
 * @typedef {{ ruleId: string, from: number, to: number }} RuleRange
 * @typedef {{ files: FileEntry[], active: string | null, fileError: Notice | null, libraries: LibraryEntry[], libraryJob: LibraryJob | null, libraryNotices: Notice[], results: Record<string, MatchResult>, matching: string | null, matchError: Notice | null, labels: Record<string, ChemistLabel>, selected: string | null, overlay: boolean, showPeaks: boolean, peakFocus: string | null, textLevel: TextLevel, modeAnim: boolean, ruleRange: RuleRange | null, decisions: Record<string, Decision>, draft: Record<string, DecisionDraft>, sheetLang: string | null, talk: boolean, subtraction: Subtraction | null, recall: RecallState, rangesOpen: boolean, rangeChoice: RangeChoice, rangeError: Notice | null, rangeTable: Record<string, RangeTable>, folder: FolderState }} AppState
 */

/** @returns {AppState} */
export function emptyState() {
  return { files: [], active: null, fileError: null, libraries: [], libraryJob: null, libraryNotices: [], results: {}, matching: null, matchError: null, labels: {}, selected: null, overlay: true, showPeaks: false, peakFocus: null, textLevel: readLevel(), modeAnim: readPref("modeAnim") !== "off", ruleRange: null, decisions: {}, draft: {}, sheetLang: null, talk: false, subtraction: null, recall: { refs: [], mode: "overlay", scale: "max", offset: 0.1, current: 0 }, rangesOpen: false, rangeChoice: { preset: "full", ranges: [] }, rangeError: null, rangeTable: {}, folder: { supported: false, watching: false, folderName: null, saved: null, remember: false, auto: false, offers: [], notice: null } };
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

/** The decision on the spectrum shown, if it still matches the comparison it was made on. @param {AppState} s @returns {Decision | null} */
export function decisionOf(s) {
  const code = activeFile(s)?.code;
  const d = code ? s.decisions[code] : undefined;
  return d && resultOf(s)?.sig === d.sig ? d : null;
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
export const PREFS = ["lang", "theme", "panel", "shortcuts", "autoMatch", "textLevel", "modeAnim"];

/** @returns {TextLevel} the remembered level of the explanation texts (counsellor when none) */
function readLevel() {
  const v = readPref("textLevel");
  return v === "chemist" || v === "teaching" ? v : "counsellor";
}

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
