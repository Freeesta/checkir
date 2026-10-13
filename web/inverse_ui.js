// @ts-check
import { groupName } from "./bands_data.js";
import { el, icon } from "./dom.js";
import { formatNumber, parseNumber, t } from "./i18n.js";
import { runInverse } from "./inverse.js";
import { analyse, interpretationsAt } from "./peaks.js";

/**
 * The inverse search dialog (`inverse.open`, key `q`): bands wanted (all must be found, or at least N), ranges that must stay empty, and the spectra of
 * the active libraries that satisfy them, grouped by substance. A result is a spectrum with a band there, never a candidate or a level; from a row the
 * compound is recalled beside the sample.
 */

const DEFAULT_TOLERANCE = 6;
const MAX_CM1 = 6553;

/** @param {import("./state.js").AppState} s @returns {number | null} the position of the focused peak of the shown spectrum */
export function focusedPosition(s) {
  const peak = s.peakFocus ? analyse(s)?.peaks.find((p) => p.id === s.peakFocus) : undefined;
  return peak ? Math.round(peak.position * 10) / 10 : null;
}

/** @param {string} id @param {string} label @param {Record<string, string>} [attrs] @returns {{ field: HTMLElement, input: HTMLInputElement }} */
function numberField(id, label, attrs = {}) {
  const input = /** @type {HTMLInputElement} */ (el("input", { type: "text", inputmode: "decimal", id, "data-fk": id, autocomplete: "off", ...attrs }));
  return { field: el("span", { class: "inverse-field" }, [el("label", { for: id }, [label]), input]), input };
}

/** @param {string} text @returns {number | null} a position or tolerance as typed (comma accepted), null when it is not a number in range */
function valueOf(text) {
  if (!text.trim()) return null;
  const x = parseNumber(text);
  return Number.isFinite(x) && x >= 0 && x <= MAX_CM1 ? x : null;
}

/** @param {import("./inverse.js").HitBand} b @returns {string} one band of a result: position, distance, relative prominence, width */
function bandText(b) {
  const width = b.width === "narrow" ? t("inverse.width_narrow") : b.width === "medium" ? t("inverse.width_medium") : b.width === "broad" ? t("inverse.width_broad") : t("inverse.width_very_broad");
  return t("inverse.band", { pos: formatNumber(b.position, 1), delta: formatNumber(b.delta, 1), prom: formatNumber(b.prominence * 100), width });
}

/** @param {import("./inverse.js").InverseHit} hit @param {import("./actions.js").Ctx} ctx @param {() => void} again @returns {HTMLElement} */
function hitRow(hit, ctx, again) {
  const at = () => ctx.getState().recall.refs.findIndex((r) => r.library === hit.library && r.spectrumId === hit.spectrumId);
  const button = el("button", { type: "button", class: "btn", "data-fk": `inverse-recall-${hit.library}-${hit.spectrumId}`, "aria-pressed": String(at() >= 0) }, [t("inverse.recall")]);
  button.addEventListener("click", () => {
    if (at() >= 0) ctx.recallRemove(at());
    else ctx.recallAdd({ library: hit.library, spectrumId: hit.spectrumId, form: hit.form });
    again();
  });
  const bands = el("ul", { class: "inverse-bands" }, hit.bands.map((b) => el("li", {}, [bandText(b)])));
  return el("tr", { "data-spectrum": `${hit.library}/${hit.spectrumId}` }, [
    el("td", {}, [hit.form || "—"]),
    el("td", {}, [hit.library]),
    el("td", {}, [formatNumber(hit.found)]),
    el("td", {}, [bands]),
    el("td", {}, [button]),
  ]);
}

/** @param {import("./inverse.js").InverseResult} r @param {number} wanted @param {import("./actions.js").Ctx} ctx @param {() => void} again @returns {HTMLElement} */
function resultTable(r, wanted, ctx, again) {
  const head = [t("inverse.col_form"), t("inverse.col_library"), t("inverse.col_found"), t("inverse.col_bands"), t("inverse.col_action")];
  const table = el("table", { class: "inverse-table" }, [
    el("caption", {}, [t("inverse.caption", { spectra: formatNumber(r.spectra), substances: formatNumber(r.groups.length), wanted: formatNumber(wanted) })]),
    el("thead", {}, [el("tr", {}, head.map((h) => el("th", { scope: "col" }, [h])))]),
  ]);
  for (const g of r.groups) {
    table.append(el("tbody", { "data-substance": g.key }, [el("tr", {}, [el("th", { scope: "rowgroup", colspan: "5" }, [g.name])]), ...g.hits.map((h) => hitRow(h, ctx, again))]));
  }
  return table;
}

/** The group readings of the wanted positions (`bands/1` rules compatible with each one), as a list of lines. @param {import("./inverse.js").Wanted[]} wanted @returns {HTMLElement | null} */
function readings(wanted) {
  const lines = wanted.flatMap((w) => {
    const groups = [...new Set(interpretationsAt(w.position, w.tolerance ?? DEFAULT_TOLERANCE).map((i) => i.group))].map(groupName);
    return groups.length ? [el("li", {}, [t("inverse.reading", { pos: formatNumber(w.position, 1), groups: groups.join(", ") })])] : [];
  });
  return lines.length ? el("ul", { class: "inverse-readings", "aria-label": t("inverse.readings") }, lines) : null;
}

/** @param {import("./inverse.js").InverseResult} r @param {import("./inverse.js").InverseSpec} spec @param {import("./actions.js").Ctx} ctx @param {() => void} again @returns {Node[]} */
function resultView(r, spec, ctx, again) {
  /** @type {Node[]} */
  const parts = [];
  if (r.failed) parts.push(el("p", { class: "error", role: "alert" }, [icon("warning"), t("inverse.error")]));
  for (const b of r.building) parts.push(el("p", { class: "note" }, [t("inverse.building", { library: b.id, done: formatNumber(b.done), total: formatNumber(b.total) })]));
  if (!r.failed && !r.spectra) parts.push(el("p", { class: "empty" }, [t("inverse.none")]));
  if (r.spectra) parts.push(resultTable(r, spec.wanted.length, ctx, again));
  if (r.truncated) parts.push(el("p", { class: "note" }, [t("inverse.truncated", { shown: formatNumber(r.spectra) })]));
  return parts;
}

/** A removable item of a list (a wanted band or an empty range). @param {string} text @param {string} label @param {() => void} remove @returns {HTMLElement} */
function chip(text, label, remove) {
  const b = el("button", { type: "button", class: "icon-button", "aria-label": label }, [icon("close")]);
  b.addEventListener("click", remove);
  return el("li", { class: "inverse-chip" }, [el("span", {}, [text]), b]);
}

/**
 * Open the dialog; `position` (cm-1) is the first band wanted when it comes from a peak.
 * @param {import("./actions.js").Ctx} ctx @param {number | null} [position]
 */
export function openInverseDialog(ctx, position = null) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  /** @type {import("./inverse.js").InverseSpec} */
  const spec = { wanted: position === null ? [] : [{ position, tolerance: null }], absent: [], minFound: null };
  const pos = numberField("inverse-pos", t("inverse.position"));
  const tol = numberField("inverse-tol", t("inverse.tolerance"), { placeholder: t("inverse.tolerance_auto") });
  const from = numberField("inverse-from", t("inverse.from"));
  const to = numberField("inverse-to", t("inverse.to"));
  const min = numberField("inverse-min", t("inverse.min_found"));
  const wantedList = el("ul", { class: "inverse-chips", "aria-label": t("inverse.wanted_list") });
  const absentList = el("ul", { class: "inverse-chips", "aria-label": t("inverse.absent_list") });
  const output = el("div", { class: "inverse-output", role: "region", "aria-live": "polite", "aria-label": t("inverse.results_label") });
  const addWanted = el("button", { type: "button", class: "btn", "data-fk": "inverse-add" }, [t("inverse.add")]);
  const addAbsent = el("button", { type: "button", class: "btn", "data-fk": "inverse-add-absent" }, [t("inverse.add_absent")]);
  const close = el("button", { type: "button", class: "icon-button", "aria-label": t("dialog.close") }, [icon("close")]);
  const problem = el("p", { class: "error", role: "alert", hidden: "" });
  const dialog = el("dialog", { class: "dialog inverse-dialog", "aria-labelledby": "inverse-title" }, [
    el("div", { class: "dialog-head" }, [el("h2", { id: "inverse-title" }, [t("inverse.title")]), close]),
    el("div", { class: "dialog-body" }, [
      el("div", { class: "row" }, [pos.field, tol.field, addWanted]), wantedList,
      el("div", { class: "row" }, [from.field, to.field, addAbsent]), absentList, problem,
      el("div", { class: "row inverse-min" }, [min.field]), output,
    ]),
  ]);
  let seq = 0;
  const run = async () => {
    const mine = ++seq;
    wantedList.replaceChildren(...spec.wanted.map((w, i) => chip(t("inverse.wanted_item", { pos: formatNumber(w.position, 1), tol: w.tolerance === null ? t("inverse.tolerance_auto") : `±${formatNumber(w.tolerance, 1)}` }), t("inverse.remove"), () => { spec.wanted.splice(i, 1); void run(); })));
    absentList.replaceChildren(...spec.absent.map((a, i) => chip(t("inverse.absent_item", { from: formatNumber(a.from, 1), to: formatNumber(a.to, 1) }), t("inverse.remove"), () => { spec.absent.splice(i, 1); void run(); })));
    min.field.hidden = spec.wanted.length < 2;
    if (!spec.wanted.length) return void output.replaceChildren(el("p", { class: "empty" }, [t("inverse.empty")]));
    const result = await runInverse(spec);
    if (mine !== seq) return;
    output.replaceChildren(...[readings(spec.wanted), ...resultView(result, spec, ctx, () => void run())].filter((n) => n !== null));
  };
  const fail = (/** @type {boolean} */ on) => {
    problem.hidden = !on;
    problem.textContent = on ? t("inverse.invalid") : "";
  };
  addWanted.addEventListener("click", () => {
    const p = valueOf(pos.input.value);
    const tolerance = valueOf(tol.input.value);
    if (p === null || (tol.input.value.trim() && (tolerance === null || tolerance === 0))) return fail(true);
    fail(false);
    spec.wanted.push({ position: p, tolerance });
    pos.input.value = tol.input.value = "";
    pos.input.focus();
    void run();
  });
  addAbsent.addEventListener("click", () => {
    const a = valueOf(from.input.value);
    const b = valueOf(to.input.value);
    if (a === null || b === null || a > b) return fail(true);
    fail(false);
    spec.absent.push({ from: a, to: b });
    from.input.value = to.input.value = "";
    void run();
  });
  min.input.addEventListener("change", () => {
    const n = valueOf(min.input.value);
    spec.minFound = n === null || n < 1 ? null : Math.round(n);
    void run();
  });
  for (const input of [pos.input, tol.input]) input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), addWanted.click()));
  for (const input of [from.input, to.input]) input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), addAbsent.click()));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    seq++;
    dialog.remove();
    opener?.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  pos.input.focus();
  void run();
}
