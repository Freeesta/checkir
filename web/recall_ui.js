// @ts-check
import { actionButton } from "./controls.js";
import { el, icon, keepFocus } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { findNames, libraryRows } from "./librerie.js";
import { MAX_REFS, recalledName, recallView } from "./recall.js";
import { SCALES } from "./recall_math.js";

/**
 * The recalled compounds beside the chart: the search dialog (`library.recall`, key `b`) and the section under the chart with the view (overlaid,
 * offset, difference), the scale, and for each compound its numbers. It never says a level: a compound picked by hand is shown with how far it is from the first.
 */

const MODES = /** @type {const} */ (["overlay", "offset", "difference"]);

/** @param {number | null} r @returns {string} */
const num = (r) => (r === null ? "—" : formatNumber(r, 2));

/** @param {import("./recall.js").RecallRow} row @returns {string} the position in the comparison, in words */
function positionText(row) {
  if (row.rank === undefined) return t("recall.no_comparison");
  if (row.rank === null) return t("recall.not_similar", { first: num(row.first) });
  return t("recall.position", { rank: formatNumber(row.rank), first: num(row.first) });
}

/** One compound of the list: dash sample, name, library, numbers, position, buttons. @param {import("./recall.js").RecallRow} row @param {number} i @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
function rowItem(row, i, s, ctx) {
  const swatch = el("span", { class: `recall-swatch recall-swatch-${i}`, "aria-hidden": "true" });
  const remove = el("button", { type: "button", class: "icon-button", "data-fk": `recall-remove-${i}`, "aria-label": t("recall.remove", { name: row.name }) }, [icon("close")]);
  remove.addEventListener("click", () => ctx.recallRemove(i));
  const kids = [swatch, el("span", { class: "recall-name" }, [`${row.name} · ${row.ref.form} · ${row.ref.library}`]), remove];
  const numbers = el("p", { class: "recall-numbers" }, [t("recall.numbers", { rs: num(row.rSpectrum), rd: num(row.rDerivative), k: formatNumber(row.k, 2) }), " ", positionText(row)]);
  const item = el("li", { class: "recall-item", "data-ref": `${row.ref.library}/${row.ref.spectrumId}` }, [el("div", { class: "row" }, kids), numbers]);
  if (s.recall.mode === "difference") {
    const use = el("button", { type: "button", class: "btn", "data-fk": `recall-use-${i}`, "aria-pressed": String(s.recall.current === i) }, [t("recall.use_difference")]);
    use.addEventListener("click", () => ctx.setRecall({ current: i }));
    item.append(use);
  }
  return item;
}

/** The view controls: three modes, the scale and, when offset, the step. @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function controls(s, ctx) {
  const radios = MODES.map((m) => {
    const input = /** @type {HTMLInputElement} */ (el("input", { type: "radio", name: "recall-mode", id: `recall-mode-${m}`, value: m, "data-fk": `recall-mode-${m}` }));
    input.checked = s.recall.mode === m;
    input.addEventListener("change", () => ctx.setRecall({ mode: m }));
    return el("label", { for: `recall-mode-${m}` }, [input, " ", m === "overlay" ? t("recall.mode_overlay") : m === "offset" ? t("recall.mode_offset") : t("recall.mode_difference")]);
  });
  const select = /** @type {HTMLSelectElement} */ (el("select", { id: "recall-scale", "data-fk": "recall-scale" }));
  const label = { raw: t("recall.scale_raw"), max: t("recall.scale_max"), area: t("recall.scale_area"), lsq: t("recall.scale_lsq") };
  for (const sc of SCALES) select.append(el("option", { value: sc }, [label[sc]]));
  select.value = s.recall.scale;
  select.addEventListener("change", () => ctx.setRecall({ scale: /** @type {any} */ (select.value) }));
  /** @type {HTMLElement[]} */
  const parts = [el("fieldset", { class: "recall-modes" }, [el("legend", {}, [t("recall.view")]), ...radios]), el("label", { for: "recall-scale" }, [t("recall.scale")]), select];
  if (s.recall.mode === "offset") {
    const step = /** @type {HTMLInputElement} */ (el("input", { type: "number", id: "recall-offset", min: "0", max: "5", step: "0.05", "data-fk": "recall-offset" }));
    step.value = String(s.recall.offset);
    step.addEventListener("change", () => ctx.setRecall({ offset: Math.max(0, Number(step.value) || 0) }));
    parts.push(el("label", { for: "recall-offset" }, [t("recall.offset")]), step);
  }
  return el("div", { class: "recall-controls" }, parts);
}

/** @param {HTMLElement} host @param {import("./actions.js").Ctx} ctx @returns {{ refresh: (s: import("./state.js").AppState) => void }} */
export function buildRecallView(host, ctx) {
  let drawn = "";
  return {
    refresh(s) {
      host.hidden = s.recall.refs.length === 0;
      if (host.hidden) return void (drawn = "");
      const view = recallView(s);
      const sig = JSON.stringify([s.recall, view.rows.map((r) => [r.rank, r.rSpectrum]), view.difference?.k, view.error, t("recall.title")]);
      if (sig === drawn) return;
      drawn = sig;
      keepFocus(host, () => {
        const list = el("ul", { class: "recall-list", "aria-label": t("recall.list") }, view.rows.map((r, i) => rowItem(r, i, s, ctx)));
        const clear = el("button", { type: "button", class: "btn", "data-fk": "recall-clear" }, [t("recall.clear")]);
        clear.addEventListener("click", () => ctx.recallClear());
        const head = el("div", { class: "row" }, [actionButton("library.recall", ctx, { withLabel: true, className: "btn" }), clear]);
        /** @type {Node[]} */
        const parts = [el("h2", { id: "recall-title" }, [t("recall.title")]), head, controls(s, ctx), list, el("p", { class: "note" }, [t("recall.note")])];
        if (view.error) parts.push(el("p", { class: "error", role: "alert" }, [t(view.error.key, view.error.params)]));
        if (view.difference) {
          const keep = el("button", { type: "button", class: "btn primary", "data-fk": "recall-keep" }, [t("recall.keep")]);
          keep.addEventListener("click", () => ctx.recallKeep());
          parts.push(el("p", { class: "recall-diff" }, [t("recall.difference_note", { name: view.difference.name, k: formatNumber(view.difference.k, 2) })]), keep);
        }
        host.replaceChildren(...parts);
      });
    },
  };
}

/** The search dialog: type the start of a name, add or remove spectra (at most three). @param {import("./actions.js").Ctx} ctx */
export function openRecallDialog(ctx) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = /** @type {HTMLInputElement} */ (el("input", { type: "search", id: "recall-q", autocomplete: "off", "data-fk": "recall-q" }));
  const list = el("ul", { class: "recall-results" });
  const count = el("p", { class: "note", role: "status" });
  const close = el("button", { type: "button", class: "icon-button", "aria-label": t("dialog.close") }, [icon("close")]);
  const dialog = el("dialog", { class: "dialog", "aria-labelledby": "recall-dialog-title" }, [
    el("div", { class: "dialog-head" }, [el("h2", { id: "recall-dialog-title" }, [t("recall.search_title")]), close]),
    el("div", { class: "dialog-body" }, [el("label", { for: "recall-q" }, [t("recall.search_label")]), input, el("p", { class: "note" }, [t("recall.search_hint", { max: String(MAX_REFS) })]), count, list]),
  ]);
  const paint = () => {
    const refs = ctx.getState().recall.refs;
    const found = input.value.trim() ? findNames(input.value, 12) : [];
    const items = found.flatMap((f) => (libraryRows(f.library) ?? []).filter((r) => r.substance === f.substance).map((r) => ({ library: f.library, spectrumId: r.id, form: r.form ?? "", name: f.name })));
    list.replaceChildren(...items.map((it) => {
      const on = refs.some((r) => r.library === it.library && r.spectrumId === it.spectrumId);
      const version = ctx.getState().libraries.find((l) => l.id === it.library)?.version ?? "";
      const b = el("button", { type: "button", class: "btn", "aria-pressed": String(on) }, [`${recalledName({ library: it.library, spectrumId: it.spectrumId, form: it.form })} · ${it.form} · ${it.library} ${version}`]);
      b.addEventListener("click", () => {
        if (on) ctx.recallRemove(refs.findIndex((r) => r.library === it.library && r.spectrumId === it.spectrumId));
        else ctx.recallAdd({ library: it.library, spectrumId: it.spectrumId, form: it.form });
        paint();
      });
      return el("li", {}, [b]);
    }));
    count.textContent = input.value.trim() ? t("recall.found", { n: formatNumber(items.length) }) : "";
  };
  input.addEventListener("input", paint);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    opener?.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}
