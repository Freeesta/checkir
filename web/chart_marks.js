// @ts-check
import { formatNumber, t } from "./i18n.js";

/**
 * Regions and peak markers of the chart, and their tables. The agreement of a region is told by a fill pattern and its r (never by colour alone);
 * a peak is told by the shape of its marker: filled = explained, hollow = not explained.
 * @typedef {{ id: string, from: number, to: number, r: number | null, agreement: "agrees" | "partial" | "disagrees" | "unknown" }} MarkRegion
 * @typedef {{ id: string, x: number, state: "explained" | "unexplained" | "artifact" | "plain", focus: boolean }} MarkPeak
 * @typedef {{ regions: MarkRegion[], peaks: MarkPeak[], rows: Array<{ id: string, position: number, state: string, by: number | null, regions: string[], shoulder: boolean }> }} Marks
 */

const NS = "http://www.w3.org/2000/svg";

/** @param {string} name @param {Record<string, string | number>} attr @returns {SVGElement} */
export function svg(name, attr) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attr)) node.setAttribute(k, String(v));
  return node;
}

/** The fill patterns, one per agreement: dots, diagonal lines, crossed lines (and none when it cannot be told). @returns {SVGElement} */
function patterns() {
  const defs = svg("defs", {});
  const make = (/** @type {string} */ id, /** @type {Array<[string, Record<string, string | number>]>} */ parts) => {
    const p = svg("pattern", { id, width: 8, height: 8, patternUnits: "userSpaceOnUse" });
    p.append(svg("rect", { class: "region-ground", width: 8, height: 8 }));
    for (const [name, attr] of parts) p.append(svg(name, { class: "region-ink", ...attr }));
    defs.append(p);
  };
  make("pat-agrees", [["circle", { cx: 4, cy: 4, r: 1.2 }]]);
  make("pat-partial", [["path", { d: "M-1 9L9 -1M-1 1L1 -1M7 9L9 7" }]]);
  make("pat-disagrees", [["path", { d: "M-1 9L9 -1M-1 1L1 -1M7 9L9 7M-1 -1L9 9" }]]);
  return defs;
}

/** @param {SVGElement} root @param {MarkRegion[]} regions @param {{ min: number, max: number }} v @param {(x: number) => number} px @param {{ top: number, height: number }} box */
export function drawRegions(root, regions, v, px, box) {
  root.append(patterns());
  for (const g of regions) {
    if (g.to < v.min || g.from > v.max) continue;
    const a = px(Math.min(g.to, v.max));
    const b = px(Math.max(g.from, v.min));
    const rect = svg("rect", { class: `region region-${g.agreement}`, x: a, y: box.top, width: b - a, height: box.height, "data-region": g.id });
    root.append(rect);
    if (g.r === null) continue;
    const label = svg("text", { class: "label region-label", x: (a + b) / 2, y: box.top + box.height - 6, "text-anchor": "middle" });
    label.textContent = `r ${formatNumber(g.r, 2)}`;
    root.append(label);
  }
}

/** @param {SVGElement} root @param {MarkPeak[]} peaks @param {{ min: number, max: number }} v @param {(x: number) => number} px @param {(x: number) => number} pyAt screen y of the curve at a wavenumber */
export function drawPeaks(root, peaks, v, px, pyAt) {
  for (const p of peaks) {
    if (p.x < v.min || p.x > v.max) continue;
    const cx = px(p.x);
    const cy = pyAt(p.x) - 8;
    const shape = svg("circle", { class: `peak peak-${p.state}${p.focus ? " peak-focus" : ""}`, cx, cy, r: p.focus ? 6 : 4, "data-peak": p.id });
    root.append(shape);
    if (!p.focus) continue;
    const label = svg("text", { class: "label peak-label", x: cx, y: cy - 10, "text-anchor": "middle" });
    label.textContent = `~${formatNumber(Math.round(p.x))}`;
    root.append(label);
  }
}

/** @param {string} state @returns {string} */
export function stateWord(state) {
  return state === "explained" ? t("peaks.state.explained") : state === "unexplained" ? t("peaks.state.unexplained") : state === "artifact" ? t("peaks.state.artifact") : t("peaks.state.plain");
}

/** @param {string} agreement @returns {string} */
export function agreementWord(agreement) {
  return agreement === "agrees" ? t("peaks.agreement.agrees") : agreement === "partial" ? t("peaks.agreement.partial") : agreement === "disagrees" ? t("peaks.agreement.disagrees") : t("peaks.agreement.unknown");
}

/** @param {string} caption @param {string[]} heads @param {string[][]} rows @returns {HTMLTableElement} */
function plainTable(caption, heads, rows) {
  const tab = document.createElement("table");
  tab.createCaption().textContent = caption;
  const head = tab.createTHead().insertRow();
  for (const h of heads) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    head.append(th);
  }
  const body = tab.createTBody();
  for (const cells of rows) {
    const r = body.insertRow();
    for (const c of cells) r.insertCell().textContent = c;
  }
  return tab;
}

/** The regions and the peaks as tables, after the data of the spectrum. @param {Marks} marks @returns {HTMLTableElement[]} */
export function marksTables(marks) {
  const regions = plainTable(
    t("table.regions_caption"),
    [t("table.region_col"), t("table.region_range"), "r", t("table.region_agreement")],
    marks.regions.map((g) => [g.id, `${formatNumber(g.from)}–${formatNumber(g.to)}`, g.r === null ? "—" : formatNumber(g.r, 2), agreementWord(g.agreement)]),
  );
  const peaks = plainTable(
    t("table.peaks_caption"),
    [t("table.wavenumber"), t("table.peak_state"), t("table.peak_by"), t("table.peak_region")],
    marks.rows.map((p) => [`~${formatNumber(Math.round(p.position))}${p.shoulder ? ` (${t("peaks.shoulder")})` : ""}`, stateWord(p.state), p.by === null ? "—" : `~${formatNumber(Math.round(p.by))}`, p.regions.join(", ") || "—"]),
  );
  return [regions, peaks];
}
