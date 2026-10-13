// @ts-check
import { announcement } from "./alerts.js";
import { dedupeCandidates } from "./candidati.js";
import { spectrumOf } from "./files.js";
import { engineUnit } from "./spectrum.js";
import { libraryOriginal, libraryRows, libraryValues } from "./librerie.js";
import { selectedCandidate } from "./results.js";
import { t } from "./i18n.js";
import { choiceKey, narrowError, normalizeRanges, optionsOf } from "./ranges.js";
import { activeFile, activeLibraries, candidateKey, getState, readPref, resultOf, subscribe, update, writePref } from "./state.js";

/**
 * Client of the comparison worker. The libraries are copied to the worker once (and again only when the set changes), the
 * spectrum goes with every run; nothing is stored. A comparison starts by itself when a spectrum is shown and the libraries
 * are there (preference `autoMatch`, on by default), and `c` runs it again.
 */

/** Same grid as the library packages (`Grid::STANDARD`): 650–3800 cm⁻¹, step 2. */
const GRID = { from: 650, step: 2 };

/** The zone left out of the comparison (diamond absorption), cm⁻¹: the mask of the chain `confronto_v1`. @type {[number, number]} */
export const EXCLUDED_CM1 = [1900, 2400];

/** @type {Worker | null} */
let worker = null;
let runSeq = 0;
let pending = 0;
/** @type {Map<number, (json: string | null) => void>} */
const waiting = new Map();
let sentSignature = "";
/** @type {Set<string>} */
const started = new Set();
/** Progress of the peak index of each library, as the worker reports it. @type {Map<string, { done: number, total: number, ready: boolean }>} */
const indexStatus = new Map();
/** Waiting for the mixture proposal that follows a comparison. @type {Map<number, (proposal: any) => void>} */
const mixtureWaiting = new Map();
/** @type {Map<number, (answer: { results: Array<{ lib: string, json: string }>, missing: string[] } | null) => void>} */
const peakWaiting = new Map();
/** @type {(text: string) => void} */
let say = () => {};

/** Is the automatic comparison on? (the only match preference; on unless the person switched it off) @returns {boolean} */
export function autoMatchOn() {
  return readPref("autoMatch") !== "off";
}

/** @param {boolean} on */
export function setAutoMatch(on) {
  writePref("autoMatch", on ? "on" : "off");
  if (on) onState(getState());
}

/** Libraries held by the page, whether switched on or not. @param {import("./state.js").AppState} s @returns {string} */
function loadedSignature(s) {
  return s.libraries.map((l) => `${l.id}@${l.version}`).join("|");
}

/** The libraries a comparison would search. @param {import("./state.js").AppState} s @returns {string} */
function activeSignature(s) {
  return activeLibraries(s).map((l) => `${l.id}@${l.version}`).join("|");
}

/** The choice of region as the engine gets it: hand-made ranges merged and sorted. @param {import("./state.js").AppState} s @returns {import("./state.js").RangeChoice} */
export function effectiveChoice(s) {
  const c = s.rangeChoice;
  return c.preset ? c : { preset: null, ranges: normalizeRanges(c.ranges) };
}

/** How a sample was measured, as the engine gets it (the shown one without a code). @param {import("./state.js").AppState} s @param {string} [code] @returns {string} */
function samplingOf(s, code) {
  return (code ? s.files.find((f) => f.code === code) : activeFile(s))?.sampling ?? "unknown";
}

/** What a result is valid for: the libraries searched, the region used and how the sample was measured (empty when no library is active). @param {import("./state.js").AppState} s @param {string} [code] the sample, the shown one without a code @returns {string} */
export function matchSignature(s, code) {
  const libs = activeSignature(s);
  return libs ? `${libs}#${choiceKey(effectiveChoice(s))}#${samplingOf(s, code)}` : "";
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./match.worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "result" || (m.type === "error" && m.runId !== undefined)) {
      waiting.get(m.runId)?.(m.type === "result" ? m.json : null);
      waiting.delete(m.runId);
    } else if (m.type === "mixture") {
      mixtureWaiting.get(m.runId)?.(m.proposal);
      mixtureWaiting.delete(m.runId);
    } else if (m.type === "peak_index") {
      indexStatus.set(m.id, { done: m.done, total: m.total, ready: m.ready });
    } else if (m.type === "peak_result") {
      peakWaiting.get(m.runId)?.({ results: m.results, missing: m.missing });
      peakWaiting.delete(m.runId);
    } else if (m.type === "error") {
      update({ matchError: { key: m.key, params: {} } });
    }
  });
  return worker;
}

/** Send the libraries the worker does not have yet (a full list of ids tells it which to drop). @param {import("./state.js").AppState} s */
function syncLibraries(s) {
  const signature = loadedSignature(s);
  if (signature === sentSignature) return;
  const w = ensureWorker();
  const previous = new Set(sentSignature.split("|"));
  w.postMessage({
    type: "sync",
    libs: s.libraries.map((l) => {
      const fresh = !previous.has(`${l.id}@${l.version}`);
      return fresh ? { id: l.id, version: l.version, rows: libraryRows(l.id) ?? [], values: libraryValues(l.id) ?? new Float32Array(), sampling: l.sampling ?? undefined, ...GRID } : { id: l.id, version: l.version };
    }),
  });
  sentSignature = signature;
}

/** The comparison worker, with the active libraries sent to it: the library test talks to it directly. @returns {Worker} */
export function matchWorker() {
  syncLibraries(getState());
  return ensureWorker();
}

/** Progress of the peak index of a library; null while the worker has not started it. @param {string} id @returns {{ done: number, total: number, ready: boolean } | null} */
export function peakIndexStatus(id) {
  return indexStatus.get(id) ?? null;
}

/**
 * Which spectra of the active libraries have a band here? `query` is the JSON of `peak_index_query`; each result is the engine's
 * answer for one library (row numbers of that library); `missing` lists the libraries whose index is still being built.
 * @param {unknown} query @returns {Promise<{ results: Array<{ lib: string, json: string }>, missing: string[] } | null>}
 */
export function searchPeaks(query) {
  const runId = ++runSeq;
  return new Promise((resolve) => {
    peakWaiting.set(runId, resolve);
    ensureWorker().postMessage({ type: "peak_query", runId, libs: activeLibraries(getState()).map((l) => l.id), query });
  });
}

/** @param {unknown} query @param {unknown} options @param {((proposal: any) => void) | null} [onMixture] asked for the mixture search that follows the comparison @returns {Promise<string | null>} */
function ask(query, options, onMixture = null) {
  const runId = ++runSeq;
  return new Promise((resolve) => {
    waiting.set(runId, resolve);
    if (onMixture) mixtureWaiting.set(runId, onMixture);
    ensureWorker().postMessage({ type: "run", runId, query, options, mixture: onMixture !== null });
  });
}

/**
 * One engine comparison of a loaded spectrum with the active libraries; `null` when the engine did not answer.
 * @param {string} code @param {Record<string, unknown>} options region and sample id
 * @param {((proposal: any) => void) | null} [onMixture] called with the mixture proposal (or null) once the worker has looked for one
 * @returns {Promise<string | null>} the result text (`ftir-risultato-confronto/1` or an error)
 */
export function compareWith(code, options, onMixture = null) {
  const spectrum = spectrumOf(code);
  const unit = spectrum ? engineUnit(spectrum) : null;
  if (!spectrum || !unit) return Promise.resolve(null);
  return ask(
    { role: "sample", y_unit: unit, wavenumber_cm1: spectrum.wavenumber_cm1, y: spectrum.y },
    { libraries: activeLibraries(getState()).map((l) => l.id), sampling: getState().files.find((f) => f.code === code)?.sampling ?? "unknown", ...options },
    onMixture,
  );
}

/** Put the mixture proposal in the result it belongs to (same spectrum, same libraries and region); a stale answer is dropped. @param {string} code @param {string} sig @param {any} proposal */
function attachMixture(code, sig, proposal) {
  const now = getState();
  const r = now.results[code];
  if (!r || r.sig !== sig || !proposal) return;
  update({ results: { ...now.results, [code]: { ...r, data: { ...r.data, mixture: proposal } } } });
}

/**
 * Compare one spectrum with the active libraries and keep the result in the state, next to the others (a result never replaces
 * the spectrum itself). A refusal or an engine error is a translatable notice in the state, never a thrown error.
 * @param {string} code
 */
export async function runMatch(code) {
  const s = getState();
  const spectrum = spectrumOf(code);
  const libs = activeLibraries(s);
  if (!spectrum || !libs.length) return;
  const unit = engineUnit(spectrum);
  if (!unit) return update({ matchError: { key: "err.match.unit_unsupported", params: {} } });
  const choice = effectiveChoice(s);
  const narrow = choice.preset ? null : narrowError(choice.ranges);
  if (narrow) return update({ rangeError: narrow });
  syncLibraries(s);
  const signature = matchSignature(s, code);
  pending++;
  update({ matching: code, matchError: null, rangeError: null });
  const json = await compareWith(code, { sample_id: code, ...optionsOf(choice) }, s.files.find((f) => f.code === code)?.role === "sample" ? (proposal) => attachMixture(code, signature, proposal) : null);
  pending--;
  const now = getState();
  const done = { matching: pending > 0 ? now.matching : null };
  /** @type {any} */
  const parsed = json ? JSON.parse(json) : { error_key: "engine.error", params: {} };
  const data = parsed.error_key ? parsed : dedupeCandidates(parsed);
  if (data.error_key || !now.files.some((f) => f.code === code)) {
    return update({ ...done, matchError: data.error_key ? { key: data.error_key, params: data.params ?? {} } : now.matchError });
  }
  update({ ...done, results: { ...now.results, [code]: { code, data, sig: signature } } });
  started.delete(`${code}#${signature}`);
  if (activeFile(getState())?.code === code) say(announcement(data));
}

/** Start the automatic comparison when the shown sample has none for the libraries now active. @param {import("./state.js").AppState} s */
function onState(s) {
  const f = activeFile(s);
  if (!f || f.role !== "sample" || !autoMatchOn()) return;
  const signature = matchSignature(s);
  if (!signature || s.results[f.code]?.sig === signature || (s.rangeError && !s.rangeChoice.preset)) return;
  const key = `${f.code}#${signature}`;
  if (started.has(key)) return;
  started.add(key);
  runMatch(f.code);
}

/**
 * Connect the comparison to the state: libraries are sent to the worker as they appear and the automatic comparison starts.
 * @param {{ announce: (text: string) => void }} deps
 */
export function startMatching({ announce }) {
  say = announce;
  // The libraries may have loaded before this call; without a later state change the worker would never hear of them.
  if (getState().libraries.length) syncLibraries(getState());
  subscribe((s) => {
    if (s.libraries.length) syncLibraries(s);
    onState(s);
  });
}

/**
 * The library spectrum of a candidate exactly as its file gives it (its own points, no resampling or smoothing), or null when
 * the library has no such copy. The resampled vectors of the calculation are never drawn as "the reference".
 * @param {string} library @param {string} spectrumId @returns {import("./spectrum.js").Spectrum | null}
 */
export function libraryCurve(library, spectrumId) {
  const original = libraryOriginal(library, spectrumId);
  return original && { wavenumber_cm1: original.wavenumber_cm1, y: original.y, y_unit: original.y_unit };
}

/** Mean spacing of the points of a spectrum, cm⁻¹ (0 with fewer than two points). @param {number[]} x @returns {number} */
export function meanStep(x) {
  return x.length > 1 ? Math.abs(x[x.length - 1] - x[0]) / (x.length - 1) : 0;
}

/**
 * The library spectrum of a candidate, scaled to the highest band of the sample outside the excluded zone, for the overlay.
 * @param {string} library @param {string} spectrumId
 * @param {import("./spectrum.js").Spectrum} sample
 * @param {[number, number]} excluded zone left out of the comparison, cm⁻¹
 * @returns {{ spectrum: import("./spectrum.js").Spectrum, scale: number } | null}
 */
export function referenceFor(library, spectrumId, sample, excluded) {
  const curve = libraryCurve(library, spectrumId);
  if (!curve) return null;
  const { wavenumber_cm1: x, y } = curve;
  const inside = (/** @type {number} */ v) => v < excluded[0] || v > excluded[1];
  const top = (/** @type {number[]} */ xs, /** @type {number[]} */ ys) => {
    let best = 0;
    for (let k = 0; k < xs.length; k++) if (xs[k] >= x[0] && xs[k] <= x[x.length - 1] && inside(xs[k]) && Number.isFinite(ys[k]) && ys[k] > best) best = ys[k];
    return best;
  };
  const ref = top(x, y);
  const own = top(sample.wavenumber_cm1, sample.y);
  const scale = ref > 0 && own > 0 ? own / ref : 1;
  return { spectrum: { wavenumber_cm1: x, y: y.map((v) => v * scale) }, scale };
}

/**
 * The comparison members of the page context (run again, choose a candidate, mark it, overlay it).
 * @param {(text: string) => void} announce
 */
export function matchActions(announce) {
  const toggleOverlay = () => {
    const on = !getState().overlay;
    update({ overlay: on });
    announce(on ? t("status.overlay_on") : t("status.overlay_off"));
  };
  return {
    runMatch: () => {
      const f = activeFile(getState());
      if (f) runMatch(f.code);
    },
    // Choosing the row that is already chosen overlays it (Enter on a row = overlay).
    selectCandidate: (/** @type {string} */ key) => {
      const s = getState();
      const r = resultOf(s);
      const chosen = r ? selectedCandidate(s, r.data) : null;
      if (chosen && key === candidateKey(chosen)) toggleOverlay();
      else update({ selected: key });
    },
    setLabel: (/** @type {string} */ key, /** @type {import("./state.js").ChemistLabel | null} */ label) => {
      const labels = { ...getState().labels };
      if (label) labels[key] = label;
      else delete labels[key];
      update({ labels });
    },
    toggleOverlay,
  };
}
