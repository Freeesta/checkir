// @ts-check
import { groupName, modeDefinition, modeName, modeOf, ruleOf, rulesOfGroup, ruleText, sourceTitles } from "./bands_data.js";
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { modeFigure } from "./mode_anim.js";
import { analyse } from "./peaks.js";
import { approx, intensityWord, shapeWord, stateWord } from "./peaks_view.js";
import { selectedCandidate, candidateName } from "./results.js";
import { resultOf } from "./state.js";
import { currentLang } from "./i18n.js";

/**
 * The card of the picked peak: what explains it (with the difference), up to three readings with the text at the chosen level, the source and
 * status of each rule, the drawing of the vibration and the other modes of the same group. The program proposes; a reading is never a conclusion.
 * @typedef {import("./peaks.js").PeakRow} PeakRow
 */

/** The three levels, simplest first; ↑ goes to the simpler one, ↓ to the next. @type {import("./state.js").TextLevel[]} */
export const LEVELS = ["counsellor", "chemist", "teaching"];
/** At most this many readings are shown. */
const MAX_READINGS = 3;

/** @param {string} status @returns {string} */
function statusWord(status) {
  return status === "verified_spectra" ? t("card.status.verified") : status === "reviewed" ? t("card.status.reviewed") : t("card.status.draft");
}

/** @param {import("./state.js").TextLevel} level @returns {string} */
function levelWord(level) {
  return level === "counsellor" ? t("card.level.counsellor") : level === "chemist" ? t("card.level.chemist") : t("card.level.teaching");
}

/** @param {number} d @returns {string} a signed difference, decimal point */
function signed(d) {
  return `${d > 0 ? "+" : d < 0 ? "−" : "±"}${formatNumber(Math.abs(d), 1)}`;
}

/** @param {PeakRow} p @param {string | null} name @returns {HTMLElement} */
function facts(p, name) {
  const by = p.by === null ? "—" : `${name ?? ""} ${approx(p.by)} cm⁻¹ (Δ ${signed(p.delta ?? 0)} cm⁻¹)`.trim();
  const rows = [[t("table.peak_intensity"), intensityWord(p.intensity)], [t("table.peak_shape"), shapeWord(p.shape)], [t("table.peak_state"), `${stateWord(p.state)}${p.otherForm ? ` · ${t("card.other_form")}` : ""}`], [t("card.explained_by"), by]];
  return el("dl", { class: "card-facts" }, rows.flatMap(([k, v]) => [el("dt", {}, [k]), el("dd", {}, [v])]));
}

/** The level selector: three buttons, one pressed; ↑ ↓ on the group move it. @param {import("./state.js").TextLevel} level @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function levelPicker(level, ctx) {
  const group = el("div", { class: "card-levels", role: "group", "aria-label": t("card.level_label") });
  for (const l of LEVELS) {
    const b = el("button", { type: "button", class: "btn", "data-level": l, "aria-pressed": String(l === level) }, [levelWord(l)]);
    b.addEventListener("click", () => ctx.setTextLevel(l));
    group.append(b);
  }
  group.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    ctx.stepLevel(e.key === "ArrowUp" ? -1 : 1);
    /** @type {HTMLElement | null} */ (document.querySelector(".card-levels button[aria-pressed=true]"))?.focus();
  });
  return group;
}

/** One reading: group and mode, its text at the level, source and status of the rule. @param {import("./peaks.js").Reading} r @param {import("./state.js").TextLevel} level @returns {HTMLElement} */
function reading(r, level) {
  const rule = r.rule_id ? ruleOf(r.rule_id) : undefined;
  const text = r.rule_id ? ruleText(r.rule_id, level) : null;
  const li = el("li", { class: "reading", "data-rule": r.rule_id ?? "" }, [el("strong", {}, [`${groupName(r.group)} · ${modeName(r.mode)}`])]);
  li.append(el("p", { class: "reading-text" }, [text ? text.text : t("card.no_text")]));
  if (text && text.level !== level) li.append(el("p", { class: "note" }, [t("card.level_fallback", { level: levelWord(/** @type {any} */ (text.level)) })]));
  const src = rule ? sourceTitles(rule.sources).join("; ") : "";
  li.append(el("p", { class: "note reading-source" }, [`${statusWord(r.rule_status)}${src ? ` · ${t("card.sources")}: ${src}` : ""}`]));
  return li;
}

/** The other rules of the same group, each with a button that shows its window on the chart. @param {string} group @param {string | null} current @param {import("./actions.js").Ctx} ctx @returns {HTMLElement | null} */
function others(group, current, ctx) {
  const rules = rulesOfGroup(group).filter((r) => r.id !== current);
  if (!rules.length) return null;
  const list = el("ul", { class: "card-others" });
  for (const r of rules) {
    const range = `~${formatNumber(Math.round(r.range_cm1.min))}–${formatNumber(Math.round(r.range_cm1.max))} cm⁻¹`;
    const b = el("button", { type: "button", class: "btn", "data-rule-range": r.id }, [t("card.show_on_chart")]);
    b.addEventListener("click", () => ctx.showRule({ ruleId: r.id, from: r.range_cm1.min, to: r.range_cm1.max }));
    list.append(el("li", {}, [`${modeName(r.mode)} · ${range} `, b]));
  }
  return el("div", {}, [el("h4", {}, [t("card.others", { group: groupName(group) })]), list]);
}

/** The vibration of the first reading: its definition and, when there is a drawing, the figure and the switch that stops it. @param {import("./peaks.js").Reading} r @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @param {(stop: () => void) => void} track @returns {HTMLElement} */
function vibration(r, s, ctx, track) {
  const box = el("div", { class: "card-mode" }, [el("h4", {}, [t("card.mode_title", { mode: modeName(r.mode) })])]);
  const def = modeDefinition(r.mode);
  if (def) box.append(el("p", {}, [def]));
  const mode = modeOf(r.mode);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fig = mode ? modeFigure(mode, { animate: s.modeAnim && !reduced }) : null;
  if (!fig) {
    box.append(el("p", { class: "note" }, [t("card.mode_words")]));
    return box;
  }
  track(fig.stop);
  box.append(fig.node);
  if (!reduced && mode?.in_plane !== false) {
    const b = el("button", { type: "button", class: "btn", "data-card": "mode-anim", "aria-pressed": String(s.modeAnim) }, [s.modeAnim ? t("card.mode_stop") : t("card.mode_play")]);
    b.addEventListener("click", () => ctx.toggleModeAnim());
    box.append(b);
  }
  return box;
}

/**
 * The card for the picked peak, or nothing. @param {HTMLElement} host @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @param {(stop: () => void) => void} track registers what must stop when the card is rebuilt
 */
export function renderPeakCard(host, s, ctx, track) {
  const a = s.showPeaks ? analyse(s) : null;
  const p = a && s.peakFocus ? a.peaks.find((x) => x.id === s.peakFocus) : undefined;
  host.hidden = !p;
  if (!p) return host.replaceChildren();
  const result = resultOf(s);
  const chosen = result ? selectedCandidate(s, result.data) : null;
  const name = chosen ? candidateName(chosen) : null;
  const first = p.readings[0];
  const close = el("button", { type: "button", class: "btn", "data-card": "close" }, [t("card.close")]);
  close.addEventListener("click", () => ctx.clearPeak());
  const head = el("div", { class: "card-head" }, [el("h3", { id: "peak-card-title" }, [t("card.title", { pos: approx(p.position) })]), close]);
  const body = [head, facts(p, name), levelPicker(s.textLevel, ctx), el("h4", {}, [t("card.readings")])];
  if (!first) body.push(el("p", { class: "note" }, [t("card.no_reading")]));
  else body.push(el("ol", { class: "readings" }, p.readings.slice(0, MAX_READINGS).map((r) => reading(r, s.textLevel))), ...(p.crowded ? [el("p", { class: "note" }, [t("card.crowded")])] : []), vibration(first, s, ctx, track));
  const more = first ? others(first.group, first.rule_id, ctx) : null;
  if (more) body.push(more);
  body.push(el("p", { class: "note" }, [t("card.caution")]), el("p", { class: "note", "aria-disabled": "true", "data-theory": "soon" }, [t("card.theory_soon")]));
  host.replaceChildren(...body);
}

/** The card in its host: rebuilt only when what it shows changes (so a drawing that moves is not restarted by unrelated updates). @param {HTMLElement} host @param {import("./actions.js").Ctx} ctx @returns {{ refresh: (s: import("./state.js").AppState) => void, reset: () => void }} */
export function createPeakCard(host, ctx) {
  let key = "";
  /** @type {Array<() => void>} */
  let stops = [];
  const stopAll = () => {
    for (const f of stops) f();
    stops = [];
  };
  return {
    reset: () => {
      key = "";
    },
    refresh(s) {
      const a = s.showPeaks ? analyse(s) : null;
      const next = [s.peakFocus, s.showPeaks, s.textLevel, s.modeAnim, s.selected, currentLang(), resultOf(s)?.sig].join("|");
      const same = next === key && a === lastAnalysis;
      if (same) return;
      key = next;
      lastAnalysis = a;
      stopAll();
      renderPeakCard(host, s, ctx, (f) => stops.push(f));
    },
  };
}

/** @type {import("./peaks.js").Analysis | null} */
let lastAnalysis = null;
