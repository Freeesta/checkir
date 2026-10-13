// @ts-check
import { EXCLUDED_CM1, referenceFor } from "./match.js";
import { selectedCandidate } from "./results.js";
import { spectrumOf } from "./files.js";
import { t } from "./i18n.js";
import { activeFile, candidateKey, getState, resultOf, update } from "./state.js";

/**
 * Which peaks of the shown spectrum the chosen candidate explains, and how well each IR region agrees with it. The program proposes:
 * a peak is «explained» when a peak of the library spectrum lies within the tolerance, nothing more. Everything stays in memory.
 */

/** A sample peak is explained by a library peak this close, cm⁻¹ (decision of the matching architect, provisional). */
export const TOLERANCE_CM1 = 8;
/** Regional r from which a region «agrees» and from which it agrees «in part»; below it does not agree (provisional, not calibrated). */
export const AGREE_MIN = 0.9;
export const PARTIAL_MIN = 0.7;
/** The regions of the comparison (`soglie_confronto.json`), used as they are when there is no result yet. */
const DEFAULT_REGION_IDS = ["3700-2500", "1900-1500", "1500-1000", "1000-650"];

/** @typedef {"agrees" | "partial" | "disagrees" | "unknown"} Agreement */
/** @typedef {{ id: string, from: number, to: number, r: number | null, agreement: Agreement }} Region */
/** @typedef {{ id: string, position: number, state: "explained" | "unexplained" | "artifact" | "plain", by: number | null, regions: string[], shoulder: boolean }} PeakRow */
/** @typedef {{ regions: Region[], peaks: PeakRow[], explained: number, unexplained: number, error: string | null }} Analysis */

/** @type {import("./engine.js").Engine | null} */
let engine = null;
/** @type {WeakMap<object, any>} */
const sampleCache = new WeakMap();
/** @type {{ key: string, value: Analysis } | null} */
let last = null;

/** @param {number | null} r @returns {Agreement} */
export function agreementOf(r) {
  if (r === null || !Number.isFinite(r)) return "unknown";
  return r >= AGREE_MIN ? "agrees" : r >= PARTIAL_MIN ? "partial" : "disagrees";
}

/** The regions to show: those of the result with their r, else the defaults without one. @param {any | null} data @returns {Region[]} */
export function regionsFor(data) {
  const chosen = data?.candidates?.[0]?.r_regions;
  const ids = chosen ? Object.keys(chosen) : DEFAULT_REGION_IDS;
  return ids.map((id) => {
    const [a, b] = id.split("-").map(Number);
    return { id, from: Math.min(a, b), to: Math.max(a, b), r: null, agreement: "unknown" };
  });
}

/** @param {Region[]} regions @param {any | null} candidate @returns {Region[]} */
function withAgreement(regions, candidate) {
  return regions.map((g) => {
    const r = candidate?.r_regions?.[g.id];
    const value = typeof r === "number" ? r : null;
    return { ...g, r: value, agreement: candidate ? agreementOf(value) : "unknown" };
  });
}

/** @param {import("./spectrum.js").Spectrum} s @returns {any | null} */
function detect(s) {
  if (!engine) return null;
  const unit = s.y_unit === "Transmittance" ? "transmittance" : "absorbance";
  const out = JSON.parse(engine.detect_peaks(JSON.stringify({ role: "sample", y_unit: unit, wavenumber_cm1: s.wavenumber_cm1, y: s.y }), ""));
  return out.error_key ? null : out;
}

/** Peak list of a spectrum, computed once per spectrum object. @param {import("./spectrum.js").Spectrum} s @returns {any | null} */
function peaksOfSpectrum(s) {
  if (!sampleCache.has(s)) sampleCache.set(s, detect(s));
  return sampleCache.get(s);
}

/** Noise of a spectrum in its own absorbance units (σ of the peak detection), or null when the engine cannot tell. @param {import("./spectrum.js").Spectrum} s @returns {number | null} */
export function noiseOf(s) {
  const n = peaksOfSpectrum(s)?.noise_abs;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** @param {any} p @param {Region[]} regions @returns {string[]} the comparison regions the position falls in */
function regionIds(p, regions) {
  return regions.filter((g) => p.position_cm1 >= g.from && p.position_cm1 <= g.to).map((g) => g.id);
}

/** @param {any} list @param {number[]} refPositions @param {Region[]} regions @param {boolean} compared @returns {PeakRow[]} */
function rowsOf(list, refPositions, regions, compared) {
  return list.peaks.map((/** @type {any} */ p) => {
    let by = null;
    for (const x of refPositions) if (Math.abs(x - p.position_cm1) <= TOLERANCE_CM1 && (by === null || Math.abs(x - p.position_cm1) < Math.abs(by - p.position_cm1))) by = x;
    const state = p.artifact ? "artifact" : !compared ? "plain" : by !== null ? "explained" : "unexplained";
    return { id: p.id, position: p.position_cm1, state, by, regions: regionIds(p, regions), shoulder: p.kind === "shoulder" };
  });
}

/**
 * The peaks and regions of the shown spectrum against the chosen candidate (or without one). Cached for the same spectrum, result and candidate.
 * @param {import("./state.js").AppState} s
 * @returns {Analysis | null} null when nothing is shown
 */
export function analyse(s) {
  const file = activeFile(s);
  const sample = file ? spectrumOf(file.code) : undefined;
  if (!file || !sample) return null;
  const result = resultOf(s);
  const chosen = result ? selectedCandidate(s, result.data) : null;
  const key = [file.code, result?.sig, chosen && candidateKey(chosen), engine ? 1 : 0].join("|");
  if (last && last.key === key && sampleCache.has(sample)) return last.value;
  const regions = withAgreement(regionsFor(result?.data ?? null), chosen);
  const list = peaksOfSpectrum(sample);
  /** @type {Analysis} */
  let value = { regions, peaks: [], explained: 0, unexplained: 0, error: list ? null : "peaks.error" };
  if (list) {
    const ref = chosen ? referenceFor(chosen.library, chosen.spectrum_id, sample, EXCLUDED_CM1) : null;
    const refList = ref ? detect(ref.spectrum) : null;
    const compared = refList !== null;
    const peaks = rowsOf(list, compared ? refList.peaks.map((/** @type {any} */ p) => p.position_cm1) : [], regions, compared);
    value = { regions, peaks, explained: peaks.filter((p) => p.state === "explained").length, unexplained: peaks.filter((p) => p.state === "unexplained").length, error: chosen && !compared ? "peaks.error" : null };
  }
  last = { key, value };
  return value;
}

/** Forget the cached analysis (after a language change nothing changes, but closing files must not keep a stale one). */
export function resetPeaks() {
  last = null;
}

/** @param {import("./engine.js").Engine | null} e @param {(text: string) => void} announce */
export function peaksActions(e, announce) {
  engine = e;
  return {
    togglePeaks: () => {
      const on = !getState().showPeaks;
      update({ showPeaks: on, peakFocus: on ? getState().peakFocus : null });
      announce(on ? t("status.peaks_on") : t("status.peaks_off"));
    },
    focusPeak: (/** @type {string | null} */ id) => update({ peakFocus: id, showPeaks: id ? true : getState().showPeaks }),
  };
}
