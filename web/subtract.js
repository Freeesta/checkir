// @ts-check
import { addResidual, lastResidual, closeFile, spectrumOf } from "./files.js";
import { t } from "./i18n.js";
import { libraryCurve, runMatch } from "./match.js";
import { noiseOf } from "./peaks.js";
import { candidateName, selectedCandidate } from "./results.js";
import { activeFile, getState, resultOf, subscribe, update } from "./state.js";

/**
 * Guided subtraction. The engine does the arithmetic (`fattore_proposto` proposes k, `sottrai` makes the residual); this module only
 * asks, keeps the factor the person chooses and turns a residual into a new spectrum under its parent. The original is never changed
 * and nothing is stored: the open subtraction and the residuals live in memory.
 */

/** A residual that goes under minus this many noise sigmas where the reference is strong is over-subtracted (same ratio as the automatic subtraction of the engine). */
export const OVER_RATIO = 3;
/** Step of the factor by arrow and by page key. */
export const STEP = 0.01;
export const BIG_STEP = 0.1;

/** @type {import("./engine.js").Engine | null} */
let engine = null;
/** @type {(text: string) => void} */
let say = () => {};

/**
 * One computed view: the three curves on the same points (absent points dropped), the minimum of the residual where the reference is strong and whether that is over-subtraction.
 * @typedef {{ x: number[], sample: number[], reference: number[], residual: number[], zoneMinimum: number | null, over: boolean }} Strips
 * @typedef {{ error: import("./state.js").Notice } | { strips: Strips }} Computed
 */

/** @type {{ id: string, base: any } | null} */
let baseCache = null;
/** @type {{ id: string, value: Computed } | null} */
let lastComputed = null;

/** @param {import("./spectrum.js").Spectrum} s @returns {string} the unit name the engine knows */
function unitName(s) {
  return s.y_unit === "Transmittance" ? "transmittance" : "absorbance";
}

/** @param {import("./engine.js").SubtractionCall} fn @param {import("./spectrum.js").Spectrum} sample @param {import("./spectrum.js").Spectrum} ref @param {object} params @returns {any} */
function call(fn, sample, ref, params) {
  const out = fn(unitName(sample), Float64Array.from(sample.wavenumber_cm1), Float64Array.from(sample.y), "absorbance", Float64Array.from(ref.wavenumber_cm1), Float64Array.from(ref.y), JSON.stringify(params));
  return JSON.parse(out);
}

/** @param {any} out @returns {import("./state.js").Notice} */
function noticeOf(out) {
  return { key: out.error_key ?? "engine.error", params: out.params ?? {} };
}

/** @param {import("./state.js").Subtraction} sub @returns {Record<string, string | number | boolean>} */
function stepParams(sub) {
  return { reference_id: sub.spectrumId, library: sub.library, baseline: true };
}

/**
 * The strips for the factor now chosen. The sample strip is the sample as the step prepares it (absorbance on the grid, baseline off), found as the residual at k = 0;
 * the reference × k strip is the difference, so the three always add up.
 * @param {import("./state.js").Subtraction} sub
 * @returns {Computed}
 */
export function computeStrips(sub) {
  const id = `${sub.sample}|${sub.library}|${sub.spectrumId}|${sub.k}`;
  if (lastComputed?.id === id) return lastComputed.value;
  const value = compute(sub);
  lastComputed = { id, value };
  return value;
}

/** @param {import("./state.js").Subtraction} sub @returns {Computed} */
function compute(sub) {
  const sample = spectrumOf(sub.sample);
  const ref = libraryCurve(sub.library, sub.spectrumId);
  if (!engine || !sample || !ref) return { error: { key: "err.subtract.reference", params: {} } };
  const baseId = `${sub.sample}|${sub.library}|${sub.spectrumId}`;
  if (baseCache?.id !== baseId) baseCache = { id: baseId, base: call(engine.sottrai, sample, ref, { ...stepParams(sub), k: 0 }) };
  const base = baseCache.base;
  if (base.error_key) return { error: noticeOf(base) };
  const cur = call(engine.sottrai, sample, ref, { ...stepParams(sub), k: sub.k });
  if (cur.error_key) return { error: noticeOf(cur) };
  /** @type {Strips} */
  const strips = { x: [], sample: [], reference: [], residual: [], zoneMinimum: typeof cur.zone_minimum === "number" ? cur.zone_minimum : null, over: false };
  const xs = cur.residual.wavenumber_cm1;
  for (let i = 0; i < xs.length; i++) {
    const a = base.residual.y[i];
    const r = cur.residual.y[i];
    if (typeof a !== "number" || typeof r !== "number") continue;
    strips.x.push(xs[i]);
    strips.sample.push(a);
    strips.residual.push(r);
    strips.reference.push(a - r);
  }
  const noise = noiseOf(sample);
  strips.over = strips.zoneMinimum !== null && noise !== null && strips.zoneMinimum < -OVER_RATIO * noise;
  return { strips };
}

/** @param {number} k @param {number} max @returns {number} the factor kept inside the slider and at two decimals */
export function clampFactor(k, max) {
  return Math.round(Math.min(max, Math.max(0, Number.isFinite(k) ? k : 0)) * 100) / 100;
}

/** Whether a subtraction can start: the shown spectrum has a result with a candidate. @param {import("./state.js").AppState} s @returns {boolean} */
export function canSubtract(s) {
  const r = resultOf(s);
  return r !== null && selectedCandidate(s, r.data) !== null;
}

/** Open the guided subtraction on the shown spectrum with the chosen candidate; the factor starts at the proposed one. */
function open() {
  const s = getState();
  const file = activeFile(s);
  const result = resultOf(s);
  const chosen = result ? selectedCandidate(s, result.data) : null;
  const sample = file ? spectrumOf(file.code) : undefined;
  const ref = chosen ? libraryCurve(chosen.library, chosen.spectrum_id) : null;
  if (!engine || !file || !chosen || !sample || !ref) return update({ fileError: { key: "err.subtract.reference", params: {} } });
  const out = call(engine.fattore_proposto, sample, ref, {});
  if (out.error_key) return update({ fileError: noticeOf(out) });
  const proposed = Math.max(0, out.k);
  const max = Math.max(2, Math.ceil(proposed * 2));
  update({ fileError: null, subtraction: { sample: file.code, library: chosen.library, spectrumId: chosen.spectrum_id, name: candidateName(chosen), k: proposed, proposed, max } });
  say(t("status.subtract_open", { code: file.code, name: candidateName(chosen) }));
}

/** @param {number} k */
function setFactor(k) {
  const sub = getState().subtraction;
  if (sub) update({ subtraction: { ...sub, k: clampFactor(k, sub.max) } });
}

/** Make the residual at the chosen factor a new spectrum under its sample, then compare it with the libraries. @returns {Promise<boolean>} whether a residual was made */
async function search() {
  const sub = getState().subtraction;
  const sample = sub ? spectrumOf(sub.sample) : undefined;
  const ref = sub ? libraryCurve(sub.library, sub.spectrumId) : null;
  if (!engine || !sub || !sample || !ref) return false;
  const out = call(engine.sottrai, sample, ref, { ...stepParams(sub), k: sub.k });
  if (out.error_key) {
    update({ fileError: noticeOf(out) });
    return false;
  }
  const xs = /** @type {number[]} */ ([]);
  const ys = /** @type {number[]} */ ([]);
  out.residual.wavenumber_cm1.forEach((/** @type {number} */ x, /** @type {number} */ i) => {
    if (typeof out.residual.y[i] === "number") {
      xs.push(x);
      ys.push(out.residual.y[i]);
    }
  });
  const code = addResidual(sub.sample, { wavenumber_cm1: xs, y: ys, y_unit: "Absorbance" }, { name: sub.name, library: sub.library, k: sub.k });
  update({ subtraction: null });
  say(t("status.subtract_done", { code }));
  runMatch(code);
  return true;
}

/** Take away the last residual; the spectrum it came from is shown again. */
function undo() {
  const last = lastResidual(getState());
  if (!last) return;
  closeFile(last.code);
  if (last.parent) update({ active: last.parent });
  say(t("status.undone", { code: last.code }));
}

/** @param {import("./engine.js").Engine | null} e @param {(text: string) => void} announce */
export function subtractActions(e, announce) {
  engine = e;
  say = announce;
  // A subtraction belongs to the spectrum it was opened on: showing another one closes it.
  subscribe((s) => {
    if (s.subtraction && activeFile(s)?.code !== s.subtraction.sample) update({ subtraction: null });
  });
  return {
    subtractOpen: open,
    subtractClose: () => {
      update({ subtraction: null });
      announce(t("status.subtract_close"));
    },
    subtractSearch: search,
    setFactor,
    undo,
  };
}
