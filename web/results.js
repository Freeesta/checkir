// @ts-check
import { alertViews, capLines, chainLine, levelBar, levelNumber, levelWord } from "./alerts.js";
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { activeFile, activeLibraries, candidateKey, resultOf } from "./state.js";
import { attachTip, toggletip } from "./tooltip.js";

/** @typedef {import("./state.js").ChemistLabel} ChemistLabel */

/** How many candidates the panel lists. */
const TOP = 10;

/** The name of a candidate in the active language, from the library index (the result carries only the library's own name). @param {any} c @returns {string} */
export function candidateName(c) {
  const row = libraryRows(c.library)?.find((r) => r.id === c.spectrum_id);
  return row ? (row.names[currentLang() === "it" ? "it" : "en"] ?? row.names.en) : c.display_name;
}

/** The candidate that is selected: the chosen one if it is still in the result, else the first. @param {import("./state.js").AppState} s @param {any} data @returns {any | null} */
export function selectedCandidate(s, data) {
  const list = (data.candidates ?? []).slice(0, TOP);
  return list.find((/** @type {any} */ c) => candidateKey(c) === s.selected) ?? list[0] ?? null;
}

/** Icon of a level. @param {number} n @returns {string} */
export function levelIcon(n) {
  return n === 2 ? "level-2" : n === 3 ? "level-3" : "level-5";
}

/** Glyph used in the numeric summaries (the same shapes as the icons). @param {number} n @returns {string} */
export function levelGlyph(n) {
  return n === 2 ? "◆" : n === 3 ? "◇" : "○";
}

/**
 * The level component: shape, word and a four-segment bar. Colour is never the only signal.
 * @param {number} n level number (2 probable, 3 to check, 5 not identified)
 * @returns {HTMLElement}
 */
export function levelBadge(n) {
  const bar = el("span", { class: "level-bar", role: "img", "aria-label": t("level.bar", { n: formatNumber(levelBar(n)) }) });
  for (let i = 0; i < 4; i++) bar.append(el("span", { class: i < levelBar(n) ? "seg on" : "seg" }));
  return el("span", { class: "level", "data-level": String(n) }, [icon(levelIcon(n)), el("strong", {}, [levelWord(n)]), bar]);
}

/** @param {any} data @returns {HTMLElement} */
function alertList(data) {
  const list = el("ul", { class: "alerts", "aria-label": t("results.alerts") });
  for (const a of alertViews(data)) {
    list.append(el("li", { class: "alert", "data-alert": a.id }, [icon("warning"), el("strong", {}, [`${a.label}: `]), ...a.reasons.map((r) => el("span", {}, [r]))]));
  }
  return list;
}

/** @type {Array<[ChemistLabel, string, () => string, () => string]>} state, icon, name, tooltip */
const LABELS = [
  ["accept", "label-accept", () => t("label.accept"), () => t("label.accept_tip")],
  ["unsure", "label-unsure", () => t("label.unsure"), () => t("label.unsure_tip")],
  ["reject", "label-reject", () => t("label.reject"), () => t("label.reject_tip")],
];

/** The three-state mark of the chemist for one row. @param {string} key @param {number} i @param {ChemistLabel | undefined} current @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function labelGroup(key, i, current, ctx) {
  const group = el("span", { class: "labels", role: "radiogroup", "aria-label": t("label.group") });
  for (const [state, iconId, name, tip] of LABELS) {
    const on = current === state;
    const b = el("button", { type: "button", class: "icon-button label-button", role: "radio", "aria-checked": String(on), "aria-label": name(), "data-fk": `lab-${i}-${state}` }, [icon(iconId)]);
    b.addEventListener("click", () => ctx.setLabel(key, on ? null : state));
    attachTip(b, tip);
    group.append(b);
  }
  return group;
}

/** @param {number} value 0..1 @param {string} label @returns {HTMLMeterElement} */
function coverageMeter(value, label) {
  const m = /** @type {HTMLMeterElement} */ (el("meter", { min: "0", max: "1", "aria-label": label }));
  m.value = Math.max(0, Math.min(1, value));
  return m;
}

/** One row of the list: select button (name, form, r, coverage), library and the chemist's mark. @param {any} c @param {number} i @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @param {boolean} selected @returns {HTMLElement} */
function candidateRow(c, i, s, ctx, selected) {
  const key = candidateKey(c);
  const name = candidateName(c);
  const r = formatNumber(c.r_derivative, 2);
  const select = el("button", { type: "button", class: "cand-select", "data-fk": `cand-${i}`, "aria-label": t("results.row", { rank: formatNumber(c.rank), name, form: c.form, library: c.library, r }) }, [
    el("span", { class: "rank" }, [formatNumber(c.rank)]),
    el("span", { class: "cand-name" }, [name]),
    el("span", { class: "cand-form" }, [c.form]),
  ]);
  if (selected) select.setAttribute("aria-current", "true");
  select.addEventListener("click", () => ctx.selectCandidate(key));
  const extra = el("span", { class: "cand-extra" }, [el("span", { class: "cand-r" }, [r]), coverageMeter(c.coverage, t("results.coverage_label", { value: formatNumber(c.coverage * 100) })), el("span", { class: "cand-lib" }, [c.library])]);
  return el("li", { class: "cand", "data-key": key, "data-label": s.labels[key] ?? "" }, [select, extra, labelGroup(key, i, s.labels[key], ctx)]);
}

/** ↑/↓ move the selection to the neighbouring row (the focus follows). @param {HTMLElement} list @param {import("./actions.js").Ctx} ctx */
function wireArrows(list, ctx) {
  list.addEventListener("keydown", (e) => {
    const target = e.target instanceof HTMLElement ? e.target.closest(".cand-select") : null;
    if (!target || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const rows = [...list.querySelectorAll(".cand-select")];
    const next = rows[rows.indexOf(target) + (e.key === "ArrowDown" ? 1 : -1)];
    if (!(next instanceof HTMLElement)) return;
    e.preventDefault();
    ctx.selectCandidate(/** @type {string} */ (next.closest(".cand")?.getAttribute("data-key")));
    /** @type {HTMLElement | null} */ (list.querySelector(`[data-fk="${next.dataset.fk}"]`))?.focus();
  });
}

/** Detail of the selected candidate, always in the same reserved space. @param {any} data @param {any | null} c @param {import("./actions.js").Ctx} ctx @param {boolean} overlay @returns {HTMLElement} */
function detail(data, c, ctx, overlay) {
  const box = el("section", { class: "detail", "aria-label": t("results.detail") });
  if (!c) return box;
  const delta = c.rank === 1 ? data.margin : data.candidates[0].r_derivative - c.r_derivative;
  box.append(
    el("p", { class: "detail-head" }, [el("strong", {}, [candidateName(c)]), ` ${c.form} · `, levelBadge(levelNumber(data))]),
    el("dl", { class: "numbers" }, [
      el("dt", {}, ["r"]), el("dd", {}, [formatNumber(c.r_derivative, 2)]),
      el("dt", {}, [t("results.delta")]), el("dd", {}, [delta === null ? "—" : formatNumber(delta, 2)]),
      el("dt", {}, [t("results.coverage")]), el("dd", {}, [`${formatNumber(c.coverage * 100)} %`, " ", toggletip(() => t("results.coverage_tip"), () => t("results.coverage_tip_label"))]),
    ]),
  );
  const button = actionButton("overlay.toggle", ctx, { withLabel: true, className: "btn" });
  button.setAttribute("aria-pressed", String(overlay));
  box.append(button);
  return box;
}

/**
 * The open part of section 3. Shapes and words say how strong the identification is; a name never appears without the level
 * in the same block; the strip of limits is outside, always visible.
 * @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx
 */
export function renderResults(body, s, ctx) {
  const result = resultOf(s);
  const file = activeFile(s);
  const head = el("div", { class: "row" }, [actionButton("match.run", ctx, { withLabel: true, className: "btn" })]);
  if (!file) return void body.append(el("p", { class: "empty" }, [t("panel.results.empty")]));
  if (!result && !activeLibraries(s).length) return void body.append(head, el("p", { class: "empty" }, [t("results.no_libraries")]));
  body.append(head);
  if (s.matchError) body.append(el("p", { class: "error", role: "alert" }, [icon("warning"), t(s.matchError.key, s.matchError.params)]));
  if (s.matching === file.code) body.append(el("p", { class: "busy", role: "status" }, [icon("compare"), t("results.running")]));
  if (!result) return void (s.matching !== file.code && body.append(el("p", { class: "empty" }, [t("results.not_run")])));
  const data = result.data;
  const n = levelNumber(data);
  const chosen = selectedCandidate(s, data);
  const title = n === 5 ? t("results.similar") : t("results.candidates");
  const list = el("ol", { class: "cands", "aria-label": title });
  (data.candidates ?? []).slice(0, TOP).forEach((/** @type {any} */ c, /** @type {number} */ i) => list.append(candidateRow(c, i, s, ctx, c === chosen)));
  wireArrows(list, ctx);
  const caps = capLines(data);
  body.append(
    el("div", { class: "result", "data-level": String(n) }, [
      el("p", { class: "level-line" }, [levelBadge(n), el("span", { class: "proposed" }, [t("results.proposed")])]),
      alertList(data),
      ...caps.map((c) => el("p", { class: "cap" }, [c])),
      el("h3", { class: "cands-title" }, [title]),
      list,
      el("p", { class: "chain" }, [chainLine(data)]),
      detail(data, chosen, ctx, s.overlay),
    ]),
  );
}

/** Numeric summary of section 3: the shape and word of the level, or a dash. @param {import("./state.js").AppState} s @returns {string} */
export function resultsSummary(s) {
  const r = resultOf(s);
  return r ? `${levelGlyph(levelNumber(r.data))} ${levelWord(levelNumber(r.data))}` : "—";
}
