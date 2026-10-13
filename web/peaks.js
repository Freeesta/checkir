// @ts-check
import { EXCLUDED_CM1, referenceFor } from "./match.js";
import { candidateName, selectedCandidate } from "./results.js";
import { peakName } from "./peaks_view.js";
import { spectrumOf } from "./files.js";
import { t } from "./i18n.js";
import { getBands } from "./regions.js";
import { activeFile, candidateKey, getState, resultOf, update, writePref } from "./state.js";

/**
 * Which peaks of the shown spectrum the chosen candidate explains, and how well each IR region agrees with it. The program proposes:
 * the engine (`assign_peaks`) says «explained» when a peak of the library spectrum lies within the tolerance of the pair, nothing more. Everything stays in memory.
 */

/** Regional r from which a region «agrees» and from which it agrees «in part»; below it does not agree (provisional, not calibrated). */
export const AGREE_MIN = 0.9;
export const PARTIAL_MIN = 0.7;
/** Relative prominence from which a peak is told strong / medium (provisional, not calibrated); below it is weak. */
export const STRONG_MIN = 0.5;
export const MEDIUM_MIN = 0.2;
/** The regions of the comparison (`soglie_confronto.json`), used as they are when there is no result yet. */
const DEFAULT_REGION_IDS = ["3700-2500", "1900-1500", "1500-1000", "1000-650"];

/** @typedef {"agrees" | "partial" | "disagrees" | "unknown"} Agreement */
/** @typedef {{ id: string, from: number, to: number, r: number | null, agreement: Agreement }} Region */
/** @typedef {"explained" | "unexplained" | "minor" | "artifact" | "plain"} PeakState */
/** @typedef {{ rule_id: string | null, group: string, mode: string, rank: number, rule_status: string, origin: string | null }} Reading */
/** @typedef {{ id: string, position: number, state: PeakState, by: number | null, delta: number | null, otherForm: boolean, group: string | null, mode: string | null, readings: Reading[], crowded: boolean, regions: string[], shoulder: boolean, intensity: "strong" | "medium" | "weak", shape: string | null, tier: "main" | "secondary" }} PeakRow */
/** @typedef {{ regions: Region[], bands: import("./regions.js").Band[], peaks: PeakRow[], main: number, explained: number, unexplained: number, minor: number, artifact: number, error: string | null }} Analysis */

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

/** @param {any} p @returns {"strong" | "medium" | "weak"} */
function intensityOf(p) {
  const r = Number(p.prominence_rel);
  return r >= STRONG_MIN ? "strong" : r >= MEDIUM_MIN ? "medium" : "weak";
}

/** Assignment of the sample peaks against the chosen candidate's peaks (`assign_peaks`, rules embedded); without a candidate only the readings. @param {any} list @param {any | null} refList @param {any | null} chosen @returns {any | null} */
function assignOf(list, refList, chosen) {
  if (!engine) return null;
  const refs = refList && chosen ? [{ substance_id: chosen.substance ?? "", form: chosen.form ?? "", library: chosen.library, version: chosen.library_version ?? null, peaks: refList }] : [];
  const out = JSON.parse(engine.assign_peaks(JSON.stringify(list), JSON.stringify(refs), "", ""));
  return out.error_key ? null : out;
}

/** @param {any} item the assignment of one peak, if any @param {any} p @param {boolean} compared @returns {PeakState} */
function stateOf(item, p, compared) {
  if (p.artifact || item?.state === "artifact") return "artifact";
  if (!compared) return "plain";
  const st = item?.state;
  return st === "explained" || st === "explained_other_form" ? "explained" : st === "minor" || p.tier === "secondary" ? "minor" : "unexplained";
}

/** @param {any} list @param {any | null} assignment @param {boolean} compared @returns {PeakRow[]} */
function rowsOf(list, assignment, compared) {
  const items = new Map((assignment?.items ?? []).map((/** @type {any} */ i) => [i.peak_id, i]));
  return list.peaks.map((/** @type {any} */ p) => {
    const item = /** @type {any} */ (items.get(p.id));
    const by = item?.explained_by ?? null;
    return { id: p.id, position: p.position_cm1, state: stateOf(item, p, compared), by: by ? by.ref_peak_cm1 : null, delta: by ? by.delta_cm1 : null, otherForm: item?.state === "explained_other_form", group: by?.group ?? null, mode: by?.mode ?? null, readings: item?.interpretations ?? [], crowded: !!item?.crowded, regions: p.region_ids ?? [], shoulder: p.kind === "shoulder", intensity: intensityOf(p), shape: p.shape ?? null, tier: p.tier === "secondary" ? "secondary" : "main" };
  });
}

/** @param {PeakRow[]} peaks @returns {{ main: number, explained: number, unexplained: number, minor: number, artifact: number }} */
function countsOf(peaks) {
  const n = (/** @type {(p: PeakRow) => boolean} */ f) => peaks.filter(f).length;
  return { main: n((p) => p.tier === "main" && p.state !== "artifact"), explained: n((p) => p.state === "explained"), unexplained: n((p) => p.state === "unexplained"), minor: n((p) => p.state === "minor"), artifact: n((p) => p.state === "artifact") };
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
  let value = { regions, bands: getBands(), peaks: [], main: 0, explained: 0, unexplained: 0, minor: 0, artifact: 0, error: list ? null : "peaks.error" };
  if (list) {
    const ref = chosen ? referenceFor(chosen.library, chosen.spectrum_id, sample, EXCLUDED_CM1) : null;
    const refList = ref ? detect(ref.spectrum) : null;
    const compared = refList !== null;
    const assignment = assignOf(list, refList, chosen);
    const peaks = rowsOf(list, assignment, compared);
    value = { regions, bands: getBands(), peaks, ...countsOf(peaks), error: chosen && (!compared || !assignment) ? "peaks.error" : null };
  }
  last = { key, value };
  return value;
}

/** Group rules (`bands/1`) compatible with a position, for the inverse search. @param {number} cm1 @param {number} tol @returns {Array<{ group: string, mode: string }>} */
export function interpretationsAt(cm1, tol) {
  if (!engine) return [];
  const out = JSON.parse(engine.interpretations_at(cm1, tol, ""));
  return Array.isArray(out) ? out : [];
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
    stepPeak: (/** @type {1 | -1} */ dir) => {
      const s = getState();
      const a = s.showPeaks ? analyse(s) : null;
      if (!a || !a.peaks.length) return false;
      const order = [...a.peaks].sort((x, y) => y.position - x.position);
      const i = order.findIndex((p) => p.id === s.peakFocus);
      const next = order[i < 0 ? (dir > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, i + dir))];
      update({ peakFocus: next.id, ruleRange: null });
      const result = resultOf(s);
      const chosen = result ? selectedCandidate(s, result.data) : null;
      announce(peakName(next, chosen ? candidateName(chosen) : null));
      return true;
    },
    clearPeak: () => {
      const s = getState();
      if (!s.peakFocus && !s.ruleRange) return false;
      update({ peakFocus: null, ruleRange: null });
      return true;
    },
    focusPeak: (/** @type {string | null} */ id) => update({ peakFocus: id, ruleRange: null, showPeaks: id ? true : getState().showPeaks }),
    setTextLevel: (/** @type {import("./state.js").TextLevel} */ level) => {
      writePref("textLevel", level);
      update({ textLevel: level });
    },
    stepLevel: (/** @type {1 | -1} */ dir) => {
      const order = ["counsellor", "chemist", "teaching"];
      const level = /** @type {import("./state.js").TextLevel} */ (order[Math.min(2, Math.max(0, order.indexOf(getState().textLevel) + dir))]);
      writePref("textLevel", level);
      update({ textLevel: level });
      announce(t("card.level_now", { level: t(level === "counsellor" ? "card.level.counsellor" : level === "chemist" ? "card.level.chemist" : "card.level.teaching") }));
    },
    toggleModeAnim: () => {
      const on = !getState().modeAnim;
      writePref("modeAnim", on ? "on" : "off");
      update({ modeAnim: on });
    },
    showRule: (/** @type {import("./state.js").RuleRange | null} */ range) => update({ ruleRange: range }),
  };
}
