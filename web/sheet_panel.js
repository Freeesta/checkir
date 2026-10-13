// @ts-check
import { levelWord } from "./alerts.js";
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { candidateName, levelBadge } from "./results.js";
import { buildSheet } from "./sheet.js";
import { candidateKey, decisionOf, resultOf } from "./state.js";
import { draftOf, listed } from "./decision.js";

/** @typedef {import("./state.js").DecisionDraft} Draft */

/** The levels a decision can take, in display order. */
const LEVELS = [1, 2, 3, 4, 5];

/** Hint under the list of candidates for each level. @type {Record<number, () => string>} */
const HINTS = { 1: () => t("decision.hint.one"), 2: () => t("decision.hint.one"), 3: () => t("decision.hint.one_or_two"), 4: () => t("decision.hint.many"), 5: () => t("decision.hint.none") };

/** Radio buttons of the level, each with its shape and word. @param {Draft} d @param {boolean} locked @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function levelPicker(d, locked, ctx) {
  const group = el("div", { class: "pick-levels", role: "radiogroup", "aria-label": t("decision.level_group") });
  for (const n of LEVELS) {
    const input = el("input", { type: "radio", name: "decision-level", value: String(n), "data-fk": `lvl-${n}` });
    input.checked = d.level === n;
    input.disabled = locked;
    input.addEventListener("change", () => ctx.setDraft({ level: n }));
    group.append(el("label", { class: "pick" }, [input, levelBadge(n, false)]));
  }
  return group;
}

/** Checkboxes of the candidates the level can take. @param {Draft} d @param {any} data @param {boolean} locked @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function candidatePicker(d, data, locked, ctx) {
  const group = el("div", { class: "pick-cands", role: "group", "aria-label": t("decision.pick_group") });
  listed(data).forEach((/** @type {any} */ c, /** @type {number} */ i) => {
    const key = candidateKey(c);
    const input = el("input", { type: "checkbox", value: key, "data-fk": `pick-${i}` });
    input.checked = d.keys.includes(key);
    input.disabled = locked || d.level === 5;
    input.addEventListener("change", () => ctx.setDraft({ keys: input.checked ? [...d.keys, key] : d.keys.filter((k) => k !== key) }));
    group.append(el("label", { class: "pick" }, [input, el("span", {}, [`${candidateName(c)} `, el("span", { class: "cand-form" }, [c.form])])]));
  });
  return group;
}

/** The IT | EN group that sets the language of the sheet apart from the interface's. @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function sheetLangGroup(s, ctx) {
  const group = el("div", { class: "lang-group", role: "group", "aria-label": t("sheet.lang_group") });
  for (const code of ["it", "en"]) {
    const b = el("button", { type: "button", class: "btn", "data-sheet-lang": code, "data-fk": `sheet-lang-${code}`, "aria-pressed": String((s.sheetLang ?? currentLang()) === code) }, [code.toUpperCase()]);
    b.addEventListener("click", () => ctx.setSheetLang(code));
    group.append(b);
  }
  return group;
}

/**
 * The open part of section 5: the decision form, the language of the sheet, print and talk mode, and the sheet itself.
 * @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx
 */
export function renderSheetPanel(body, s, ctx) {
  const r = resultOf(s);
  const d = draftOf(s);
  if (!r || !d) return void body.append(el("p", { class: "empty" }, [t("panel.sheet.empty")]));
  const dec = decisionOf(s);
  const form = el("fieldset", { class: "decision", "data-decided": dec ? "1" : "0" }, [el("legend", {}, [icon("pen"), t("decision.legend")]), levelPicker(d, Boolean(dec), ctx), candidatePicker(d, r.data, Boolean(dec), ctx)]);
  if (!dec) form.append(el("p", { class: "hint" }, [(HINTS[d.level] ?? HINTS[5])()]));
  const status = el("p", { class: "decision-state", }, [dec ? icon("pen") : icon("warning"), dec ? t("decision.done", { level: levelWord(dec.level) }) : t("decision.draft_state")]);
  const sign = actionButton(dec ? "decision.revoke" : "decision.sign", ctx, { withLabel: true, className: "btn primary" });
  const tools = el("div", { class: "row" }, [sign, actionButton("sheet.print", ctx, { withLabel: true, className: "btn" }), actionButton("sheet.talk", ctx, { withLabel: true, className: "btn" })]);
    const preview = el("div", { class: "sheet-preview", "aria-label": t("sheet.preview"), role: "group" }, [buildSheet(s, { chemist: true })]);
  body.append(form, status, tools, sheetLangGroup(s, ctx), preview);
}

/** Numeric summary of section 5: the level of the decision or a dash. @param {import("./state.js").AppState} s @returns {string} */
export function sheetSummary(s) {
  const dec = decisionOf(s);
  return dec ? `✎ ${formatNumber(dec.level)}` : "—";
}
