// @ts-check
import { announcement } from "./alerts.js";
import { spectrumOf } from "./files.js";
import { libraryRows, libraryValues } from "./librerie.js";
import { selectedCandidate } from "./results.js";
import { t } from "./i18n.js";
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

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./match.worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "result" || (m.type === "error" && m.runId !== undefined)) {
      waiting.get(m.runId)?.(m.type === "result" ? m.json : null);
      waiting.delete(m.runId);
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
      return fresh ? { id: l.id, version: l.version, rows: libraryRows(l.id) ?? [], values: libraryValues(l.id) ?? new Float32Array(), ...GRID } : { id: l.id, version: l.version };
    }),
  });
  sentSignature = signature;
}

/** The comparison worker, with the active libraries sent to it: the library test talks to it directly. @returns {Worker} */
export function matchWorker() {
  syncLibraries(getState());
  return ensureWorker();
}

/** @param {string | undefined} unit @returns {string | null} the unit name the engine knows */
function unitOf(unit) {
  return unit === undefined || unit === "Absorbance" ? "absorbance" : unit === "Transmittance" ? "transmittance" : null;
}

/** @param {unknown} query @param {unknown} options @returns {Promise<string | null>} */
function ask(query, options) {
  const runId = ++runSeq;
  return new Promise((resolve) => {
    waiting.set(runId, resolve);
    ensureWorker().postMessage({ type: "run", runId, query, options });
  });
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
  const unit = unitOf(spectrum.y_unit);
  if (!unit) return update({ matchError: { key: "err.match.unit_unsupported", params: {} } });
  syncLibraries(s);
  const signature = activeSignature(s);
  pending++;
  update({ matching: code, matchError: null });
  const json = await ask(
    { role: "sample", y_unit: unit, wavenumber_cm1: spectrum.wavenumber_cm1, y: spectrum.y },
    { libraries: libs.map((l) => l.id), sample_id: code },
  );
  pending--;
  const now = getState();
  const done = { matching: pending > 0 ? now.matching : null };
  /** @type {any} */
  const data = json ? JSON.parse(json) : { error_key: "engine.error", params: {} };
  if (data.error_key || !now.files.some((f) => f.code === code)) {
    return update({ ...done, matchError: data.error_key ? { key: data.error_key, params: data.params ?? {} } : now.matchError });
  }
  update({ ...done, results: { ...now.results, [code]: { code, data, sig: signature } } });
  if (activeFile(getState())?.code === code) say(announcement(data));
}

/** Start the automatic comparison when the shown sample has none for the libraries now active. @param {import("./state.js").AppState} s */
function onState(s) {
  const f = activeFile(s);
  if (!f || f.role !== "sample" || !autoMatchOn()) return;
  const signature = activeSignature(s);
  if (!signature || s.results[f.code]?.sig === signature) return;
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
  subscribe((s) => {
    if (s.libraries.length) syncLibraries(s);
    onState(s);
  });
}

/**
 * The library spectrum of a candidate, scaled to the highest band of the sample outside the excluded zone, for the overlay.
 * @param {string} library @param {string} spectrumId
 * @param {import("./spectrum.js").Spectrum} sample
 * @param {[number, number]} excluded zone left out of the comparison, cm⁻¹
 * @returns {{ spectrum: import("./spectrum.js").Spectrum, scale: number } | null}
 */
export function referenceFor(library, spectrumId, sample, excluded) {
  const rows = libraryRows(library);
  const values = libraryValues(library);
  const i = rows?.findIndex((r) => r.id === spectrumId) ?? -1;
  if (!rows || !values || i < 0) return null;
  const n = values.length / rows.length;
  const y = Array.from(values.subarray(i * n, (i + 1) * n));
  const x = y.map((_, k) => GRID.from + GRID.step * k);
  const inside = (/** @type {number} */ v) => v < excluded[0] || v > excluded[1];
  const top = (/** @type {number[]} */ xs, /** @type {number[]} */ ys) => {
    let best = 0;
    for (let k = 0; k < xs.length; k++) if (xs[k] >= GRID.from && xs[k] <= GRID.from + GRID.step * (n - 1) && inside(xs[k]) && Number.isFinite(ys[k]) && ys[k] > best) best = ys[k];
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
