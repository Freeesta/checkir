// @ts-check
import { alertViews, capLines, chainLine, levelBar, levelNumber, levelWord, shownLevel } from "./alerts.js";
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { openSheet } from "./schede_ui.js";
import { activeFile, activeLibraries, candidateKey, decisionOf, resultOf } from "./state.js";
import { renderRanges, rangeTable, usedRangeLine } from "./ranges_ui.js";
import { attachTip, toggletip } from "./tooltip.js";

/** @typedef {import("./state.js").ChemistLabel} ChemistLabel */

/** How many candidates the decision can use. */
export const LISTED = 10;

/** How many candidates the work area lists under the chart. */
export const SHOWN = 5;

/** The name of a candidate in the active language, from the library index (the result carries only the library's own name). @param {any} c @returns {string} */
export function candidateName(c) {
  const row = libraryRows(c.library)?.find((r) => r.id === c.spectrum_id);
  return row ? (row.names[currentLang() === "it" ? "it" : "en"] ?? row.names.en) : c.display_name;
}

/** The candidate that is selected: the chosen one if it is still in the result, else the first. @param {import("./state.js").AppState} s @param {any} data @returns {any | null} */
export function selectedCandidate(s, data) {
  const list = (data.candidates ?? []).slice(0, SHOWN);
  return list.find((/** @type {any} */ c) => candidateKey(c) === s.selected) ?? list[0] ?? null;
}

/** Icon of a level. @param {number} n @returns {string} */
export function levelIcon(n) {
  return n >= 1 && n <= 4 ? `level-${n}` : "level-5";
}

/** Glyph used in the numeric summaries (the same shapes as the icons). @param {number} n @returns {string} */
export function levelGlyph(n) {
  return n === 1 || n === 2 ? "◆" : n === 3 ? "◇" : n === 4 ? "◫" : "○";
}

/**
 * The level component: shape, word and a four-segment bar. Colour is never the only signal.
 * @param {number} n level number (1 confirmed … 5 not identified)
 * @param {boolean} [withBar] the four-segment bar (the counselling sheet leaves it out: shape and word say it)
 * @returns {HTMLElement}
 */
export function levelBadge(n, withBar = true) {
  const bar = el("span", { class: "level-bar", role: "img", "aria-label": t("level.bar", { n: formatNumber(levelBar(n)) }) });
  for (let i = 0; i < 4; i++) bar.append(el("span", { class: i < levelBar(n) ? "seg on" : "seg" }));
  return el("span", { class: "level", "data-level": String(n) }, [icon(levelIcon(n)), el("strong", {}, [levelWord(n)]), ...(withBar ? [bar] : [])]);
}

/** "proposed by the program", or the pen and "decided by the chemist" (with the proposal when it differs). @param {import("./state.js").Decision | null} dec @param {number} proposed @returns {HTMLElement} */
function decisionMark(dec, proposed) {
  if (!dec) return el("span", { class: "proposed" }, [t("results.proposed")]);
  const was = dec.level === proposed ? "" : ` · ${t("results.proposed_was", { level: levelWord(proposed) })}`;
  return el("span", { class: "proposed decided" }, [icon("pen"), `${t("results.decided")}${was}`]);
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

/** One row of the list: select button (name, form), r, delta from the first, coverage, library and the chemist's mark. @param {any} c @param {number} i @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @param {boolean} selected @param {any} data @returns {HTMLElement} */
function candidateRow(c, i, s, ctx, selected, data) {
  const key = candidateKey(c);
  const name = candidateName(c);
  const r = formatNumber(c.r_derivative, 2);
  const select = el("button", { type: "button", class: "cand-select", "data-fk": `cand-${i}`, "aria-label": t("results.row", { rank: formatNumber(c.rank), name, form: c.form ? ` ${c.form},` : "", library: c.library, r }) }, [
    el("span", { class: "rank" }, [formatNumber(c.rank)]),
    el("span", { class: "cand-name" }, [name]),
    el("span", { class: "cand-form" }, [c.form]),
  ]);
  if (selected) select.setAttribute("aria-current", "true");
  select.addEventListener("click", () => ctx.selectCandidate(key));
  const delta = c.rank === 1 ? data.margin : data.candidates[0].r_derivative - c.r_derivative;
  const extra = el("span", { class: "cand-extra" }, [el("span", { class: "cand-r" }, [r]), el("span", { class: "cand-delta" }, [`${t("results.delta")} ${delta === null ? "—" : formatNumber(delta, 2)}`]), coverageMeter(c.coverage, t("results.coverage_label", { value: formatNumber(c.coverage * 100) })), el("span", { class: "cand-lib" }, [c.library])]);
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

/** Detail of the selected candidate, always in the same reserved space. @param {any} data @param {any | null} c @param {import("./actions.js").Ctx} ctx @param {import("./state.js").AppState} s @param {number} level @returns {HTMLElement} */
function detail(data, c, ctx, s, level) {
  const box = el("section", { class: "detail", "aria-label": t("results.detail") });
  if (!c) return box;
  const delta = c.rank === 1 ? data.margin : data.candidates[0].r_derivative - c.r_derivative;
  box.append(
    el("p", { class: "detail-head" }, [el("strong", {}, [candidateName(c)]), c.form ? ` ${c.form} · ` : " · ", levelBadge(level)]),
    el("dl", { class: "numbers" }, [
      el("dt", {}, ["r"]), el("dd", {}, [formatNumber(c.r_derivative, 2)]),
      el("dt", {}, [t("results.delta")]), el("dd", {}, [delta === null ? "—" : formatNumber(delta, 2)]),
      el("dt", {}, [t("results.coverage")]), el("dd", {}, [`${formatNumber(c.coverage * 100)} %`, " ", toggletip(() => t("results.coverage_tip"), () => t("results.coverage_tip_label"))]),
    ]),
  );
  const button = actionButton("overlay.toggle", ctx, { withLabel: true, className: "btn" });
  button.setAttribute("aria-pressed", String(s.overlay));
  const row = libraryRows(c.library)?.find((/** @type {any} */ r) => r.id === c.spectrum_id);
  const tools = el("div", { class: "row" }, [button, actionButton("subtract.open", ctx, { withLabel: true, className: "btn" })]);
  if (row?.substance && level <= 4) {
    // level 5 names nobody ("the most similar"): the sheet of a substance stays closed
    const sheet = el("button", { type: "button", class: "btn", "data-fk": "open-sheet" }, [icon("sheet"), t("sheets.open")]);
    sheet.addEventListener("click", () => void openSheet(row.substance, candidateName(c)));
    tools.append(sheet);
  }
  box.append(tools);
  const regions = rangeTable(s, c);
  if (regions) box.append(regions);
  return box;
}

/** "subtracted: name, library, k = 0.84" for a residual (written in the active language, never stored). @param {import("./state.js").Derived} d @returns {string} */
export function derivedText(d) {
  return t("file.derived", { name: d.name, library: d.library, k: formatNumber(d.k, 2) });
}

/** The residuals made from a spectrum, at any depth, in the order they were made (a residual always comes after its parent). @param {import("./state.js").AppState} s @param {string} code @returns {import("./state.js").FileEntry[]} */
function residualsOf(s, code) {
  const known = new Set([code]);
  return s.files.filter((f) => f.role === "residual" && f.parent !== null && known.has(f.parent) && known.add(f.code));
}

/** Read-only rows of a residual's candidates; the full panel (labels, detail, overlay) is the residual's own, one click away. @param {any} data @returns {HTMLElement} */
function residualRows(data) {
  const list = el("ol", { class: "cands", "aria-label": t("results.candidates") });
  (data.candidates ?? []).slice(0, SHOWN).forEach((/** @type {any} */ c) => {
    const row = el("li", { class: "cand", "data-key": candidateKey(c) }, [
      el("span", { class: "cand-select" }, [el("span", { class: "rank" }, [formatNumber(c.rank)]), el("span", { class: "cand-name" }, [candidateName(c)]), el("span", { class: "cand-form" }, [c.form])]),
      el("span", { class: "cand-extra" }, [el("span", { class: "cand-r" }, [formatNumber(c.r_derivative, 2)]), coverageMeter(c.coverage, t("results.coverage_label", { value: formatNumber(c.coverage * 100) })), el("span", { class: "cand-lib" }, [c.library])]),
    ]);
    list.append(row);
  });
  return list;
}

/** The search on a residual, shown under the one on its sample and never in its place. @param {import("./state.js").FileEntry} f @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement | null} */
function residualBlock(f, s, ctx) {
  const result = s.results[f.code];
  const head = el("h3", { class: "cands-title" }, [t("results.on_residual", { code: f.code })]);
  const note = el("p", { class: "note" }, [f.derived ? derivedText(f.derived) : ""]);
  if (!result) return s.matching === f.code ? el("div", { class: "result-residual", "data-code": f.code }, [head, note, el("p", { class: "busy", role: "status" }, [icon("compare"), t("results.running")])]) : null;
  const n = levelNumber(result.data);
  const show = el("button", { type: "button", class: "btn", "data-fk": `show-${f.code}` }, [icon("results"), t("results.residual_show", { code: f.code })]);
  show.addEventListener("click", () => ctx.selectFile(f.code));
  return el("div", { class: "result result-residual", "data-level": String(n), "data-code": f.code }, [
    head,
    note,
    el("p", { class: "level-line" }, [levelBadge(n), el("span", { class: "proposed" }, [t("results.proposed")])]),
    alertList(result.data),
    el("h3", { class: "cands-title" }, [n === 5 ? t("results.similar") : t("results.candidates")]),
    residualRows(result.data),
    el("p", { class: "chain" }, [chainLine(result.data)]),
    show,
  ]);
}

/** What to say while there is no result to list: no library, an error, the comparison running, or not run yet. @param {import("./state.js").AppState} s @param {import("./state.js").FileEntry} file @param {boolean} hasResult @returns {HTMLElement[]} */
function statusNodes(s, file, hasResult) {
  if (!hasResult && !activeLibraries(s).length) return [el("p", { class: "empty" }, [t("results.no_libraries")])];
  const nodes = [];
  if (s.matchError) nodes.push(el("p", { class: "error", role: "alert" }, [icon("warning"), t(s.matchError.key, s.matchError.params)]));
  if (s.matching === file.code) nodes.push(el("p", { class: "busy", role: "status" }, [icon("compare"), t("results.running")]));
  else if (!hasResult) nodes.push(el("p", { class: "empty" }, [t("results.not_run")]));
  return nodes;
}

/**
 * The candidates, under the chart. Shapes and words say how strong the identification is; a name never appears without the level
 * in the same block.
 * @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx
 */
export function renderResults(body, s, ctx) {
  const result = resultOf(s);
  const file = activeFile(s);
  if (!file) return;
  body.append(...statusNodes(s, file, !!result));
  if (!result) return;
  const data = result.data;
  const dec = decisionOf(s);
  const n = dec?.level ?? levelNumber(data);
  const chosen = selectedCandidate(s, data);
  const title = n === 5 ? t("results.similar") : t("results.candidates");
  const list = el("ol", { class: "cands", "aria-label": title });
  (data.candidates ?? []).slice(0, SHOWN).forEach((/** @type {any} */ c, /** @type {number} */ i) => list.append(candidateRow(c, i, s, ctx, c === chosen, data)));
  wireArrows(list, ctx);
  body.append(
    el("div", { class: "result", "data-level": String(n) }, [
      el("h2", { class: "cands-title" }, [title]),
      el("p", { class: "level-line" }, [levelBadge(n), decisionMark(dec, levelNumber(data))]),
      alertList(data),
      ...capLines(data).map((c) => el("p", { class: "cap" }, [c])),
      ...(usedRangeLine(data) ? [el("p", { class: "cap", "data-used-range": "1" }, [usedRangeLine(data)])] : []),
      list,
      el("p", { class: "chain" }, [chainLine(data)]),
      detail(data, chosen, ctx, s, n),
    ]),
    ...residualsOf(s, file.code).map((f) => residualBlock(f, s, ctx)).filter((b) => b !== null),
  );
}

/** Section 3 of the panel: the comparison button and a summary (the level in words and how many candidates); the list itself is under the chart. @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
export function renderResultsPanel(body, s, ctx) {
  const file = activeFile(s);
  if (!file) return void body.append(el("p", { class: "empty" }, [t("panel.results.empty")]));
  const result = resultOf(s);
  body.append(el("div", { class: "row" }, [actionButton("match.run", ctx, { withLabel: true, className: "btn" })]));
  renderRanges(body, s, ctx);
  body.append(...statusNodes(s, file, !!result));
  if (!result) return;
  const dec = decisionOf(s);
  body.append(
    el("p", { class: "level-line" }, [levelBadge(dec?.level ?? levelNumber(result.data)), decisionMark(dec, levelNumber(result.data))]),
    el("p", { class: "note" }, [t("results.count", { n: formatNumber((result.data.candidates ?? []).length) })]),
  );
}

/** Numeric summary of section 3: the shape and word of the level, or a dash. @param {import("./state.js").AppState} s @returns {string} */
export function resultsSummary(s) {
  const r = resultOf(s);
  const n = shownLevel(s);
  return r && n ? `${levelGlyph(n)} ${levelWord(n)}` : "—";
}
