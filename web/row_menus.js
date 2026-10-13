// @ts-check
import { matchScore } from "./candidati.js";
import { anchorOf, isMenuKey, openMenu } from "./context_menu.js";
import { formatNumber, t } from "./i18n.js";
import { analyse } from "./peaks.js";
import { candidateName, selectedCandidate } from "./results.js";
import { activeLibraries, candidateKey, resultOf } from "./state.js";

/**
 * Context menus of the rows: a candidate (`li.cand`), a peak (`.peak-item`) and an IR region (`.region-item`). One listener on the document finds the row;
 * the rows of each menu come from a builder below. Right click, or the Menu key / Shift+F10 on the focused row. Rows act through the page context, nothing else.
 * @typedef {import("./actions.js").Ctx} Ctx
 * @typedef {import("./context_menu.js").MenuRow} Row
 */

/** @param {{ id: string, labelKey: string }} item @param {() => void} run @param {boolean} [enabled] @returns {Row} */
const row = (item, run, enabled = true) => ({ id: item.id, label: t(item.labelKey), disabled: !enabled, run });

/** @param {HTMLElement} li @param {Ctx} ctx @returns {Row[]} */
function candidateRows(li, ctx) {
  const s = ctx.getState();
  const key = li.dataset.key ?? "";
  const code = li.closest("[data-code]")?.getAttribute("data-code") ?? null;
  const own = code === null || code === s.active;
  const data = (code ? s.results[code] : resultOf(s))?.data;
  const c = (data?.candidates ?? []).find((/** @type {any} */ x) => candidateKey(x) === key);
  if (!c) return [];
  const chosen = () => {
    const r = resultOf(ctx.getState());
    const sel = r ? selectedCandidate(ctx.getState(), r.data) : null;
    return sel ? candidateKey(sel) === key : false;
  };
  const choose = () => {
    if (!chosen()) ctx.selectCandidate(key);
  };
  return [
    row({ id: "cand.compare", labelKey: "rowmenu.compare" }, () => {
      choose();
      if (!ctx.getState().overlay) ctx.toggleOverlay();
    }, own),
    row({ id: "cand.sheet", labelKey: "rowmenu.sheet" }, () => {
      choose();
      ctx.goto("sheet");
    }, own),
    row({ id: "cand.recall", labelKey: "rowmenu.recall" }, () => void ctx.recallAdd({ library: c.library, spectrumId: c.spectrum_id, form: c.form })),
    row({ id: "cand.copy", labelKey: "rowmenu.copy" }, () => void ctx.copyText([formatNumber(c.rank), candidateName(c), c.form, c.library, formatNumber(matchScore(c.r_derivative)), formatNumber(c.coverage * 100)].join("\t"))),
  ];
}

/** @param {HTMLElement} item @param {Ctx} ctx @returns {Row[]} */
function peakRows(item, ctx) {
  const s = ctx.getState();
  const p = analyse(s)?.peaks.find((x) => x.id === item.dataset.peak);
  if (!p) return [];
  return [
    row({ id: "peak.pick", labelKey: "rowmenu.peak_pick" }, () => ctx.focusPeak(p.id)),
    row({ id: "peak.inverse", labelKey: "rowmenu.peak_inverse" }, () => ctx.inverseOpen(p.position), activeLibraries(s).length > 0),
    row({ id: "peak.copy", labelKey: "rowmenu.copy" }, () => void ctx.copyText(`${formatNumber(p.position, 1)}\t${p.intensity}`)),
  ];
}

/** @param {HTMLElement} item @param {Ctx} ctx @returns {Row[]} */
function regionRows(item, ctx) {
  const from = Number(item.dataset.from);
  const to = Number(item.dataset.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  return [
    row({ id: "region.range", labelKey: "rowmenu.region_range" }, () => ctx.addRange([Math.round(from), Math.round(to)])),
    row({ id: "region.copy", labelKey: "rowmenu.copy" }, () => void ctx.copyText(`${formatNumber(from)}\t${formatNumber(to)}`)),
  ];
}

const KINDS = /** @type {const} */ ([
  { selector: "#candidates li.cand[data-key]", build: candidateRows, labelKey: "rowmenu.candidate" },
  { selector: ".peak-item[data-peak]", build: peakRows, labelKey: "rowmenu.peak" },
  { selector: ".region-item[data-from]", build: regionRows, labelKey: "rowmenu.region" },
]);

/** Attach the row menus to the whole page. @param {Ctx} ctx */
export function attachRowMenus(ctx) {
  /** @param {Event} e @param {number} x @param {number} y @returns {boolean} a menu was opened */
  const show = (e, x, y) => {
    const target = e.target instanceof Element ? e.target : null;
    for (const { selector, build, labelKey } of KINDS) {
      const item = target?.closest(selector);
      if (!(item instanceof HTMLElement)) continue;
      const rows = build(item, ctx);
      if (!rows.length) return false;
      e.preventDefault();
      const back = item.querySelector("button") ?? item;
      openMenu({ x, y, label: t(labelKey), rows, returnFocus: back instanceof HTMLElement ? back : null });
      return true;
    }
    return false;
  };
  document.addEventListener("contextmenu", (e) => void show(e, e.clientX, e.clientY));
  document.addEventListener("keydown", (e) => {
    if (!isMenuKey(e) || !(e.target instanceof Element)) return;
    const at = anchorOf(e.target);
    show(e, at.x, at.y);
  });
}
