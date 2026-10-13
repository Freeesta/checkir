// @ts-check
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { formatNumber, parseNumber, t } from "./i18n.js";
import { drawStrips, stripsTable } from "./strips.js";
import { BIG_STEP, computeStrips, STEP } from "./subtract.js";

/**
 * The work-area view of the guided subtraction: the factor (slider, number field, the proposed value), the strips with their table, the
 * over-subtraction warning and the fixed sentence «the factor is not the quantity». It is shown in place of the chart while a subtraction is open.
 * @param {HTMLElement} host
 * @param {import("./actions.js").Ctx} ctx
 * @returns {{ refresh: (s: import("./state.js").AppState) => void }}
 */
export function buildSubtractView(host, ctx) {
  const title = el("h2", { id: "subtract-title" });
  const formula = el("p", { class: "subtract-formula" });
  const range = /** @type {HTMLInputElement} */ (el("input", { type: "range", id: "factor-range", min: "0", step: "0.01", "data-fk": "factor-range", "aria-keyshortcuts": "ArrowUp ArrowDown PageUp PageDown" }));
  const field = /** @type {HTMLInputElement} */ (el("input", { type: "text", id: "factor-field", inputmode: "decimal", size: "5", "data-fk": "factor-field", autocomplete: "off" }));
  const rangeLabel = el("label", { for: "factor-range" });
  const fieldLabel = el("label", { for: "factor-field", class: "sr-only" });
  const proposed = el("button", { type: "button", class: "btn", "data-fk": "factor-proposed" });
  const keys = el("p", { class: "note" });
  const warning = el("p", { class: "subtract-warning", role: "alert" });
  const error = el("p", { class: "error", role: "alert" });
  const chart = el("div", { class: "strips" });
  const table = el("div", { class: "scroll", tabindex: "0", role: "region" });
  const buttons = el("div", { class: "row" }, [actionButton("subtract.search", ctx, { withLabel: true, className: "btn primary" }), actionButton("subtract.close", ctx, { withLabel: true, className: "btn" })]);
  host.append(title, formula, el("div", { class: "factor" }, [rangeLabel, range, fieldLabel, field, proposed]), keys, warning, error, chart, buttons, table);

  range.addEventListener("input", () => ctx.setFactor(Number(range.value)));
  range.addEventListener("keydown", (e) => {
    const delta = { ArrowUp: STEP, ArrowDown: -STEP, PageUp: BIG_STEP, PageDown: -BIG_STEP }[/** @type {"ArrowUp"} */ (e.key)];
    if (delta === undefined) return;
    e.preventDefault();
    ctx.setFactor(Number(range.value) + delta);
  });
  const commit = () => {
    const v = parseNumber(field.value);
    if (!Number.isFinite(v)) field.value = formatNumber(Number(range.value), 2);
    else ctx.setFactor(v);
    const sub = ctx.getState().subtraction;
    if (sub) field.value = formatNumber(sub.k, 2);
  };
  field.addEventListener("change", commit);
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
  });
  proposed.addEventListener("click", () => {
    const sub = ctx.getState().subtraction;
    if (sub) ctx.setFactor(sub.proposed);
  });

  let drawn = "";
  let warned = "";
  return {
    refresh(s) {
      const sub = s.subtraction;
      host.hidden = !sub;
      if (!sub) return void ((drawn = ""), (warned = ""));
      const names = { sample: sub.sample, name: sub.name, k: sub.k };
      title.textContent = t("subtract.title");
      formula.textContent = t("subtract.formula", { code: sub.sample, name: sub.name, library: sub.library });
      rangeLabel.textContent = t("subtract.factor_label");
      fieldLabel.textContent = t("subtract.factor_field");
      range.max = String(sub.max);
      range.value = String(sub.k);
      range.setAttribute("aria-valuetext", formatNumber(sub.k, 2));
      if (document.activeElement !== field) field.value = formatNumber(sub.k, 2);
      proposed.replaceChildren(icon("subtract"), t("subtract.proposed", { k: formatNumber(sub.proposed, 2) }));
      keys.textContent = t("subtract.keys");
      table.setAttribute("aria-label", t("subtract.table_region"));
      const key = [sub.sample, sub.spectrumId, sub.k, sub.name, t("subtract.title")].join("|");
      if (key === drawn) return;
      drawn = key;
      const out = computeStrips(sub);
      error.replaceChildren();
      if ("error" in out) {
        error.append(icon("warning"), t(out.error.key, out.error.params));
        warning.replaceChildren();
        warned = "";
        chart.replaceChildren();
        return void table.replaceChildren();
      }
      const warnKey = `${out.strips.over}|${t("subtract.title")}`;
      if (warnKey !== warned) warning.replaceChildren(...(out.strips.over ? [icon("warning"), t("subtract.over")] : []));
      warned = warnKey;
      drawStrips(chart, out.strips, names);
      stripsTable(table, out.strips, names);
    },
  };
}
