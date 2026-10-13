// @ts-check
import { agreementWord } from "./chart_marks.js";
import { approx, peakName } from "./peaks_view.js";
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { analyse } from "./peaks.js";
import { candidateName, levelBadge, selectedCandidate } from "./results.js";
import { levelNumber } from "./alerts.js";
import { resultOf } from "./state.js";

/** Marker glyph of a peak state: ● explained, ○ not explained, ◌ artifact of the measurement, · no comparison yet. @param {string} state @returns {string} */
export function peakGlyph(state) {
  return state === "explained" ? "●" : state === "unexplained" ? "○" : state === "minor" ? "◇" : state === "artifact" ? "◌" : "·";
}

/** Numeric summary of section 4. @param {import("./state.js").AppState} s @returns {string} */
export function peaksSummary(s) {
  const a = analyse(s);
  return a && !a.error ? `● ${formatNumber(a.explained)} ○ ${formatNumber(a.unexplained)}` : "—";
}

/** @param {import("./state.js").AppState} s @returns {string} */
export function peaksLabel(s) {
  const a = analyse(s);
  return t("panel.peaks.counts", { explained: formatNumber(a?.explained ?? 0), unexplained: formatNumber(a?.unexplained ?? 0) });
}

/** @param {import("./peaks.js").Analysis} a @returns {HTMLElement} */
function regionList(a) {
  const list = el("ul", { class: "regions", "aria-label": t("peaks.regions_label") });
  for (const g of a.regions) {
    const r = (g.r === null ? "" : ` · r ${formatNumber(g.r, 2)}`) + (g.share === null ? "" : ` · ${t("peaks.signal_share", { share: formatNumber(g.share * 100, 1) })}`);
    list.append(el("li", { class: `region-item region-${g.agreement}`, "data-region": g.id }, [el("span", { class: "swatch", "aria-hidden": "true" }), `${formatNumber(g.from)}–${formatNumber(g.to)} cm⁻¹${r} · ${agreementWord(g.agreement)}`]));
  }
  return list;
}

/** @param {import("./peaks.js").Analysis} a @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx @returns {HTMLElement} */
function peakList(a, s, ctx) {
  const result = resultOf(s);
  const chosen = result ? selectedCandidate(s, result.data) : null;
  const who = chosen ? candidateName(chosen) : null;
  const list = el("ul", { class: "peak-list", "aria-label": t("peaks.list_label") });
  for (const p of a.peaks) {
    const pos = approx(p.position);
    const by = p.by === null ? "" : ` → ${approx(p.by)}`;
    const b = el("button", { type: "button", class: "peak-item", "data-fk": `peak-${p.id}`, "data-state": p.state, "aria-pressed": String(s.peakFocus === p.id), "aria-label": peakName(p, who) }, [el("span", { class: "glyph", "aria-hidden": "true" }, [peakGlyph(p.state)]), `${pos}${by}`]);
    b.addEventListener("click", () => ctx.focusPeak(s.peakFocus === p.id ? null : p.id));
    list.append(el("li", {}, [b]));
  }
  return list;
}

/** Section 4: which peaks of the shown spectrum the chosen candidate explains, and how each IR region agrees. @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
export function renderPeaks(body, s, ctx) {
  const a = analyse(s);
  if (!a) return void body.append(el("p", { class: "empty" }, [t("panel.peaks.empty")]));
  const toggle = actionButton("peaks.toggle", ctx, { withLabel: true, className: "btn" });
  toggle.setAttribute("aria-pressed", String(s.showPeaks));
  body.append(el("div", { class: "row" }, [toggle, actionButton("inverse.open", ctx, { withLabel: true, className: "btn" })]));
  if (a.error) return void body.append(el("p", { class: "error", role: "alert" }, [icon("warning"), t("peaks.error")]));
  const result = resultOf(s);
  const chosen = result ? selectedCandidate(s, result.data) : null;
  if (result && chosen) body.append(el("p", { class: "peaks-ref" }, [levelBadge(levelNumber(result.data)), ` ${a.refName ? t("peaks.against_mixture", { name: a.refName }) : t("peaks.against", { name: candidateName(chosen), library: chosen.library })}`]));
  else body.append(el("p", { class: "empty" }, [t("peaks.no_result")]));
  body.append(el("p", { class: "peaks-counts" }, [peaksSummary(s)]), regionList(a));
  if (!a.peaks.length) body.append(el("p", { class: "empty" }, [t("panel.peaks.empty")]));
  else body.append(peakList(a, s, ctx), el("p", { class: "note" }, [t("peaks.tolerance")]), el("p", { class: "note" }, [t("peaks.keys")]));
}
