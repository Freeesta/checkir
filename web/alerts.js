// @ts-check
import { formatNumber, t } from "./i18n.js";
import { decisionOf, resultOf } from "./state.js";

/**
 * Levels and alerts of a comparison result (`ftir-risultato-confronto/1`), as the page shows them. The program only proposes a level
 * (never "confirmed": that belongs to the chemist). The engine already sends the alerts in display order.
 * @typedef {{ id: string, label: string, reasons: string[] }} AlertView
 */

/** Level numbers of the interface (the program proposes 2, 3 or 5; 1 confirmed and 4 mixture come only from the chemist's decision). @type {Record<string, number>} */
const LEVEL_NUMBER = { probable: 2, to_check: 3, not_identified: 5 };
/** Identification tier shown before the word (T1 is only the chemist's; the mixture level has none). @type {Record<number, string>} */
const TIER = { 1: "T1", 2: "T2", 3: "T3", 5: "T4" };
/** Filled segments of the four-segment bar. @type {Record<number, number>} */
const LEVEL_BAR = { 1: 4, 2: 3, 3: 2, 4: 2, 5: 0 };

/** @param {any} data @returns {number} */
export function levelNumber(data) {
  return LEVEL_NUMBER[data.level_proposed] ?? 5;
}

/** @param {number} n @returns {number} filled segments, out of four */
export function levelBar(n) {
  return LEVEL_BAR[n] ?? 0;
}

/** The word of a level in the active language (also the header chip and the announcement). @param {number} n @returns {string} */
export function levelWord(n) {
  const word = n === 1 ? t("level.1.word") : n === 2 ? t("level.2.word") : n === 3 ? t("level.3.word") : n === 4 ? t("level.4.word") : t("level.5.word");
  const tier = TIER[n];
  return tier ? t("level.tier", { tier, word }) : word;
}

/** The level on show for the spectrum shown: the chemist's decision if there is one, else the program's proposal; null without a result. @param {import("./state.js").AppState} s @returns {number | null} */
export function shownLevel(s) {
  const r = resultOf(s);
  return r ? (decisionOf(s)?.level ?? levelNumber(r.data)) : null;
}

/** @param {any} r a row reference of an alert: name, form and r @returns {string} */
function rowText(r) {
  const name = r?.form ? `${r.display_name} (${r.form})` : String(r?.display_name ?? "");
  return `${name} ${formatNumber(Number(r?.r), 2)}`;
}

/** @param {unknown} v @param {number} [d] @returns {string} */
const num = (v, d = 2) => formatNumber(Number(v), d);

/** @type {Record<string, { labelKey: string, reasons: (d: any) => string[] }>} */
const ALERTS = {
  flagged_family: { labelKey: "alert.flagged_family.label", reasons: (d) => [t("alert.flagged_family.reason", { family: String(d.family ?? d.name ?? "") })] },
  ambiguity: {
    labelKey: "alert.ambiguity.label",
    reasons(d) {
      const out = [];
      if (d.second) out.push(t("alert.ambiguity.reason", { first: rowText(d.first), second: rowText(d.second) }));
      if (d.spectrum_first) out.push(t("alert.ambiguity.spectrum", { other: rowText(d.spectrum_first) }));
      return out.length ? out : [t("alert.ambiguity.reason_short", { first: rowText(d.first) })];
    },
  },
  spectral_twin: {
    labelKey: "alert.spectral_twin.label",
    reasons: (d) => (d.state === "computing" ? [t("alert.spectral_twin.computing", { done: num(d.progress?.done, 0), total: num(d.progress?.total, 0) })] : [t("alert.spectral_twin.reason", { twin: rowText(d.twin) })]),
  },
  different_form: { labelKey: "alert.different_form.label", reasons: (d) => [t("alert.different_form.reason", { first: rowText(d.first), other: rowText(d.other), rank: num(d.other_rank, 0) })] },
  form_absent: { labelKey: "alert.form_absent.label", reasons: (d) => [t("alert.form_absent.reason", { form: String(d.expected_form), first: rowText(d.first) })] },
  custom_range: { labelKey: "alert.custom_range.label", reasons: (d) => [t("alert.custom_range.reason", { ranges: (d.ranges ?? []).map((/** @type {number[]} */ r) => `${num(r[0], 0)}–${num(r[1], 0)}`).join(", ") })] },
  same_as_previous: { labelKey: "alert.same_as_previous.label", reasons: (d) => [t("alert.same_as_previous.reason", { r: num(d.r) })] },
  quality_saturation: { labelKey: "alert.quality_saturation.label", reasons: (d) => [t("alert.quality_saturation.reason", { max: num(d.max_absorbance), at: num(d.at_cm1, 0), limit: num(d.limit, 1) })] },
  quality_weak_signal: { labelKey: "alert.quality_weak_signal.label", reasons: (d) => [t("alert.quality_weak_signal.reason", { band: num(d.strongest_band, 3), limit: num(d.limit, 2) })] },
  quality_noise: { labelKey: "alert.quality_noise.label", reasons: (d) => [t("alert.quality_noise.reason", { ratio: num(d.ratio, 0), limit: num(d.limit, 0) })] },
  quality_co2_vapour: {
    labelKey: "alert.quality_co2_vapour.label",
    reasons: (d) => [t("alert.quality_co2_vapour.reason", { what: [d.co2 ? t("alert.part.co2") : "", d.vapour ? t("alert.part.vapour") : ""].filter(Boolean).join(" + ") })],
  },
  quality_negative_bands: { labelKey: "alert.quality_negative_bands.label", reasons: (d) => [t("alert.quality_negative_bands.reason", { min: num(d.minimum, 3), at: num(d.at_cm1, 0) })] },
};

/**
 * The alerts to list, in the engine's order. An id this page does not know still shows, with its raw id as the label and no reason.
 * @param {any} data
 * @returns {AlertView[]}
 */
export function alertViews(data) {
  /** @type {AlertView[]} */
  const out = [];
  for (const a of data.alerts ?? []) {
    const def = ALERTS[a.id];
    out.push({ id: a.id, label: def ? t(def.labelKey) : a.id, reasons: def ? def.reasons(a.data ?? {}) : [] });
  }
  return out;
}

/** Why the level cannot go higher, one line per cap. @param {any} data @returns {string[]} */
export function capLines(data) {
  /** @type {Record<string, () => string>} */
  const lines = { coverage: () => t("results.cap.coverage"), custom_range: () => t("results.cap.custom_range"), range_not_calibrated: () => t("results.cap.range_not_calibrated"), sampling_not_calibrated: () => t("results.cap.sampling_not_calibrated") };
  return (data.level_caps ?? []).map((/** @type {string} */ c) => lines[c]?.() ?? c);
}

/** The announcement after a comparison: "10 candidates, Probable, 1 alert". @param {any} data @returns {string} */
export function announcement(data) {
  const alerts = alertViews(data).length;
  const count = (data.candidates ?? []).length;
  const params = { count: formatNumber(count), level: levelWord(levelNumber(data)), alerts: formatNumber(alerts) };
  return alerts === 1 ? t("status.match_done_one", params) : t("status.match_done", params);
}

/** The chain and the libraries used: `confronto_v1 · RESPONSE 2024 · BCCSU 2025`. @param {any} data @returns {string} */
export function chainLine(data) {
  const libs = (data.libraries ?? []).filter((/** @type {any} */ l) => l.searched).map((/** @type {any} */ l) => `${l.id} ${l.version}`);
  return [data.chain?.derivative ?? "", ...libs].filter(Boolean).join(" · ");
}

/** Does the comparison cover less than the whole range? (the header shows a "region" icon) @param {any} data @returns {boolean} */
export function isPartialRange(data) {
  return data.range_preset !== "full";
}
