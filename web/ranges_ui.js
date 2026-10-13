// @ts-check
import { matchScore } from "./candidati.js";
import { el, icon } from "./dom.js";
import { formatNumber, parseNumber, t } from "./i18n.js";
import { agreementOf } from "./peaks.js";
import { agreementWord } from "./chart_marks.js";
import { PRESETS, rangesOf } from "./ranges.js";
import { attachTip } from "./tooltip.js";
import { candidateKey, resultOf } from "./state.js";
import { LISTED, candidateName } from "./results.js";

/** The region picker (section 3): presets, numeric fields for the ranges (the brush on the x axis has the same effect), and the candidate × region table. */

/** One numeric field with a visible label. @param {string} text @param {string} name accessible name @param {string} fk @param {number | null} value @param {(v: number) => void} onCommit @returns {HTMLElement} */
function numberField(text, name, fk, value, onCommit) {
  const input = el("input", { type: "text", inputmode: "numeric", autocomplete: "off", class: "range-input", "aria-label": name, "data-fk": fk, value: value === null ? "" : formatNumber(value) });
  input.addEventListener("change", () => onCommit(parseNumber(input.value)));
  return el("label", { class: "range-field" }, [el("span", {}, [text]), input]);
}

/** @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function presetGroup(s, ctx) {
  const group = el("div", { class: "range-presets", role: "group", "aria-label": t("ranges.presets") });
  for (const p of PRESETS) {
    const b = el("button", { type: "button", class: "btn", "aria-pressed": String(s.rangeChoice.preset === p.id), "data-fk": `range-preset-${p.id}` }, [t(p.labelKey)]);
    b.addEventListener("click", () => ctx.setPreset(p.id));
    attachTip(b, () => t(p.tipKey));
    group.append(b);
  }
  if (s.rangeChoice.preset === null) group.append(el("span", { class: "range-custom", role: "status" }, [icon("region"), t("ranges.preset.custom")]));
  return group;
}

/** The ranges of the choice, each with its two fields and a remove button. @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function rangeList(s, ctx) {
  const list = el("ol", { class: "range-list", "aria-label": t("ranges.list") });
  const ranges = rangesOf(s.rangeChoice);
  ranges.forEach(([a, b], i) => {
    const n = formatNumber(i + 1);
    const edit = (/** @type {0 | 1} */ k) => (/** @type {number} */ v) => {
      if (!Number.isFinite(v)) return ctx.rejectRange();
      ctx.setRanges(ranges.map((r, j) => (j === i ? (k === 0 ? [v, r[1]] : [r[0], v]) : r)));
    };
    const remove = el("button", { type: "button", class: "icon-button", "aria-label": t("ranges.remove", { n }), "data-fk": `range-remove-${i}` }, [icon("close")]);
    remove.addEventListener("click", () => ctx.removeRange(i));
    list.append(el("li", {}, [el("strong", {}, [t("ranges.name", { n })]), numberField(t("ranges.from"), t("ranges.from_of", { n }), `range-from-${i}`, a, edit(0)), numberField(t("ranges.to"), t("ranges.to_of", { n }), `range-to-${i}`, b, edit(1)), remove]));
  });
  return list;
}

/** Add a range typed in the two fields, or by the cursors. @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function addForm(ctx) {
  const vals = { from: NaN, to: NaN };
  const form = el("div", { class: "range-add" });
  const add = el("button", { type: "button", class: "btn", "data-fk": "range-add" }, [icon("region"), t("ranges.add")]);
  add.addEventListener("click", () => (Number.isFinite(vals.from) && Number.isFinite(vals.to) && vals.from !== vals.to ? ctx.addRange([Math.min(vals.from, vals.to), Math.max(vals.from, vals.to)]) : ctx.rejectRange()));
  const cursors = el("button", { type: "button", class: "btn", "data-fk": "range-cursors" }, [t("ranges.from_cursors")]);
  cursors.addEventListener("click", () => ctx.rangeFromCursors());
  const clear = el("button", { type: "button", class: "btn", "data-fk": "range-clear" }, [t("ranges.clear")]);
  clear.addEventListener("click", () => ctx.clearRanges());
  form.append(numberField(t("ranges.from"), t("ranges.new_from"), "range-new-from", null, (v) => (vals.from = v)), numberField(t("ranges.to"), t("ranges.new_to"), "range-new-to", null, (v) => (vals.to = v)), add, cursors, clear);
  return form;
}

/**
 * The region picker for the body of section 3.
 * @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx
 */
export function renderRanges(body, s, ctx) {
  if (!s.rangesOpen) return;
  const box = el("fieldset", { class: "ranges", "data-ranges": "1" }, [el("legend", {}, [icon("region"), t("ranges.title")])]);
  box.append(presetGroup(s, ctx));
  if (s.rangeChoice.preset === null) box.append(rangeList(s, ctx));
  box.append(addForm(ctx));
  if (s.rangeError) box.append(el("p", { class: "error", role: "alert" }, [icon("warning"), t(s.rangeError.key, s.rangeError.params)]));
  body.append(box);
}

/** A cell: the number, the word and a fill pattern, never colour alone. @param {number | null | undefined} r @param {boolean} busy @param {any} data the result, which carries the limits @returns {HTMLElement} */
function cell(r, busy, data) {
  const td = el("td");
  if (r === undefined || r === null) {
    td.textContent = busy && r === undefined ? t("ranges.table.busy") : t("ranges.table.out");
    return td;
  }
  const agreement = agreementOf(r, data);
  td.append(el("span", { class: `region-${agreement}` }, [el("span", { class: "swatch" }), ` ${formatNumber(matchScore(r))} · ${agreementWord(agreement)}`]));
  return td;
}

/**
 * The candidate × region table of the candidate detail: r of the chosen candidate on the whole range and on every region of the
 * choice. Nothing is drawn when only the whole range is used.
 * @param {import("./state.js").AppState} s @param {any} c the chosen candidate @returns {HTMLElement | null}
 */
export function rangeTable(s, c) {
  const result = resultOf(s);
  const table = result ? s.rangeTable[result.code] : undefined;
  if (!result || !table || table.sig !== result.sig || !table.columns.length) return null;
  const heads = [t("ranges.table.candidate"), ...table.columns.map((col, i) => (col.id === "full" ? t("ranges.table.full") : t("ranges.table.region", { n: formatNumber(i), from: formatNumber(col.ranges[0][0]), to: formatNumber(col.ranges[0][1]) })))];
  const tab = el("table", { class: "ranges-table" }, [el("caption", {}, [t("ranges.table.caption")])]);
  tab.append(el("thead", {}, [el("tr", {}, heads.map((h) => el("th", { scope: "col" }, [h])))]));
  const key = candidateKey(c);
  tab.append(el("tbody", {}, [el("tr", {}, [el("th", { scope: "row" }, [`${formatNumber(c.rank)}. ${candidateName(c)}${c.form ? ` (${c.form})` : ""}`]), ...table.columns.map((col) => cell(table.cells[col.id]?.[key], table.busy, result.data))])]));
  return el("div", { class: "ranges-table-wrap", role: "region", tabindex: "0", "aria-label": t("ranges.table.caption") }, [tab]);
}

/** One line saying which region the shown result was computed on, or "" for the whole range. @param {any} data @returns {string} */
export function usedRangeLine(data) {
  if (data.range_preset === "full") return "";
  const list = (data.ranges ?? []).map((/** @type {number[]} */ r) => `${formatNumber(r[0])}–${formatNumber(r[1])}`).join("; ");
  return t("ranges.used", { ranges: list, kind: data.range_preset ? t("ranges.used_preset") : t("ranges.used_custom") });
}
