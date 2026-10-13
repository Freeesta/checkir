// @ts-check
import { alertViews } from "./alerts.js";
import { chosenCandidates, shownChoice } from "./decision.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, inLang, t } from "./i18n.js";
import { candidateName, levelBadge } from "./results.js";
import { decisionOf, resultOf } from "./state.js";

/**
 * The counselling sheet: four blocks in a fixed order (head, found, alerts, foot with the signature line), built from the state in memory after the chemist's decision (before it, a draft
 * with a watermark). It is never stored. Its language is chosen apart from the interface's. Short sentences, no score, no
 * percentage, and never a word that reassures; no fixed warning text, only data of the sample and of this result.
 */

let programVersion = "";

/** The version of the program, for the head of the sheet. @param {string} version */
export function setProgramVersion(version) {
  programVersion = version;
}

/** Fixed order of the alerts on the sheet: a flagged family always first, hand-picked region after the quality ones. */
const ORDER = ["flagged_family", "ambiguity", "spectral_twin", "analog_not_in_library", "different_form", "form_absent", "high_residual", "same_as_previous", "quality_saturation", "quality_weak_signal", "quality_noise", "quality_co2_vapour", "quality_negative_bands", "custom_range"];

/** One short plain sentence per alert (the technical reason stays in the chemist's view). @type {Record<string, (d: any) => string>} */
const LINES = {
  flagged_family: (d) => t("sheet.alert.flagged_family", { family: String(d.family ?? d.name ?? "") }),
  ambiguity: () => t("sheet.alert.ambiguity"),
  spectral_twin: () => t("sheet.alert.spectral_twin"),
  different_form: () => t("sheet.alert.different_form"),
  form_absent: () => t("sheet.alert.form_absent"),
  custom_range: () => t("sheet.alert.custom_range"),
  same_as_previous: () => t("sheet.alert.same_as_previous"),
  quality_saturation: () => t("sheet.alert.quality_saturation"),
  quality_weak_signal: () => t("sheet.alert.quality_weak_signal"),
  quality_noise: () => t("sheet.alert.quality_noise"),
  quality_co2_vapour: () => t("sheet.alert.quality_co2_vapour"),
  quality_negative_bands: () => t("sheet.alert.quality_negative_bands"),
};

/** Today as a day, local time (the sheet carries a day, never a time). @returns {string} */
function today() {
  const d = new Date();
  const two = (/** @type {number} */ n) => formatNumber(n).padStart(2, "0");
  return `${formatNumber(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** @param {string} title the heading text, already translated @param {string} id @param {Array<Node | string>} children @returns {HTMLElement} */
function block(title, id, children) {
  return el("section", { class: "sheet-block", "data-block": id }, [el("h3", {}, [title]), ...children]);
}

/** Block 1: title, local code, day, program and library versions, thresholds. No datum of the person. @param {string} code @param {any} data @returns {HTMLElement} */
function headBlock(code, data) {
  const libs = (data.libraries ?? []).filter((/** @type {any} */ l) => l.searched).map((/** @type {any} */ l) => `${l.id} ${l.version}`).join(", ");
  const rows = [[t("sheet.code"), code], [t("sheet.day"), today()], [t("sheet.program"), programVersion], [t("sheet.libraries"), libs || "—"], [t("sheet.thresholds"), data.chain?.derivative ?? "—"]];
  const list = el("dl", { class: "sheet-meta" });
  for (const [k, v] of rows) list.append(el("dt", {}, [k]), el("dd", {}, [v]));
  return el("header", { class: "sheet-head", "data-block": "head" }, [el("h2", {}, [t("sheet.title")]), list]);
}

/** @param {any} c a candidate @returns {string} name and form */
function nameOf(c) {
  return c.form ? `${candidateName(c)} (${c.form})` : candidateName(c);
}

/** The sentence or names of block 2, by level. @param {import("./state.js").DecisionDraft} choice @param {any} data @returns {Array<Node | string>} */
function foundLines(choice, data) {
  const picked = chosenCandidates(choice, data);
  const names = picked.map((c) => el("strong", { class: "sheet-name" }, [nameOf(c)]));
  const joined = picked.map(nameOf).join(", ");
  if (choice.level === 5 || !picked.length) {
    return [el("p", {}, [t("sheet.found.none")]), el("p", { class: "sheet-strong" }, [t("sheet.found.none_active")])];
  }
  if (choice.level <= 2) return [el("p", {}, names)];
  if (choice.level === 3 && picked.length === 2) return [el("p", {}, [t("sheet.found.between", { a: nameOf(picked[0]), b: nameOf(picked[1]) })]), el("p", {}, names)];
  const sentence = choice.level === 4 ? t("sheet.found.components", { names: joined }) : t("sheet.found.compatible", { names: joined });
  return [el("p", {}, [sentence]), el("p", {}, names)];
}

/** Block 2: what was found, with the level as a shape and a word, and who decided. A name never stands without its level. @param {import("./state.js").DecisionDraft} choice @param {any} data @param {boolean} decided @returns {HTMLElement} */
function foundBlock(choice, data, decided) {
  const who = el("span", { class: "sheet-who" }, [decided ? icon("pen") : "", decided ? t("sheet.found.decided") : t("sheet.found.proposed")]);
  const box = el("div", { class: "found" }, [el("p", { class: "level-row" }, [levelBadge(choice.level, false), who]), ...foundLines(choice, data)]);
  return block(t("sheet.found.title"), "found", [box]);
}

/** Block 3: the alerts, one plain line each in the fixed order; the chemist's view adds the technical reason (and the region of a hand-picked one). @param {any} data @param {boolean} chemist @returns {HTMLElement} */
function alertsBlock(data, chemist) {
  const views = alertViews(data).sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
  const list = el("ul", { class: "sheet-alerts" });
  for (const v of views) {
    const raw = (data.alerts ?? []).find((/** @type {any} */ a) => a.id === v.id);
    const line = (LINES[v.id] ?? (() => t("sheet.alert.other")))(raw?.data ?? {});
    const item = el("li", { class: "sheet-alert", "data-sheet-alert": v.id }, [icon("warning"), el("strong", {}, [`${v.label}: `]), line]);
    if (chemist && v.reasons.length) item.append(el("span", { class: "chem-only" }, [` (${v.reasons.join("; ")})`]));
    list.append(item);
  }
  return block(t("sheet.alerts.title"), "alerts", [views.length ? list : el("p", {}, [t("sheet.alerts.none")])]);
}

/** Block 4: foot with the chemist's signature line. @returns {HTMLElement} */
function footBlock() {
  return el("footer", { class: "sheet-foot", "data-block": "foot" }, [
    el("p", { class: "signature" }, [el("span", { class: "sign-label" }, [t("sheet.foot.sign")]), el("span", { class: "sign-line" })]),
  ]);
}

/**
 * Build the sheet of the spectrum shown, in the sheet language. Without a result it is an empty article.
 * @param {import("./state.js").AppState} s
 * @param {{ chemist?: boolean }} [opts] `chemist`: the chemist's view adds the technical reasons of the alerts
 * @returns {HTMLElement}
 */
export function buildSheet(s, opts = {}) {
  const r = resultOf(s);
  const choice = shownChoice(s);
  const lang = s.sheetLang ?? currentLang();
  const sheet = el("article", { class: "sheet", lang });
  if (!r || !choice) return sheet;
  const decided = decisionOf(s) !== null;
  sheet.setAttribute("data-draft", decided ? "0" : "1");
  inLang(lang, () => {
    sheet.setAttribute("aria-label", t("sheet.title"));
    if (!decided) {
      sheet.setAttribute("data-watermark", t("sheet.draft"));
      sheet.append(el("p", { class: "sheet-banner" }, [icon("warning"), t("sheet.draft")]));
    }
    sheet.append(headBlock(r.code, r.data), foundBlock(choice, r.data, decided), alertsBlock(r.data, Boolean(opts.chemist)), footBlock());
  });
  return sheet;
}

/** Keep the hidden host that print and talk mode show in step with the state. @param {HTMLElement} host @param {import("./state.js").AppState} s */
export function syncSheetHost(host, s) {
  host.replaceChildren(buildSheet(s));
}
