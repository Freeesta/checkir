// @ts-check
import { formatNumber, t } from "./i18n.js";
import { bandName, bandTag } from "./regions.js";
import { approx, bandTable, peakTable } from "./peaks_view.js";

/**
 * Regions and peak markers of the chart, and their tables. A region is told by a fill pattern (one per family), its short label and its full name
 * in the table, never by colour alone; a peak is told by the shape of its marker: filled = explained, hollow = not explained, diamond = minor,
 * dotted = measurement artifact, dashed outline = shoulder.
 * @typedef {{ id: string, from: number, to: number, family: string }} MarkBand
 * @typedef {{ id: string, x: number, state: "explained" | "unexplained" | "minor" | "artifact" | "plain", focus: boolean, shoulder: boolean }} MarkPeak
 * @typedef {{ bands: MarkBand[], peaks: MarkPeak[], rows: import("./peaks.js").PeakRow[], name: string | null, focus: string | null, rule?: { from: number, to: number, label: string } | null }} Marks
 */

const NS = "http://www.w3.org/2000/svg";
/** Height of one row of region labels, px of the chart's coordinate system. */
const LANE = 13;

/** @param {string} name @param {Record<string, string | number>} attr @returns {SVGElement} */
export function svg(name, attr) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attr)) node.setAttribute(k, String(v));
  return node;
}

/** Strokes of each family's pattern, 8 px cell: the families differ by the drawing, the colour only helps. @type {Record<string, Array<[string, Record<string, string | number>]>>} */
const INK = {
  oh_nh: [["circle", { cx: 4, cy: 4, r: 1.3 }]],
  ch: [["path", { d: "M-1 9L9 -1M-1 1L1 -1M7 9L9 7" }]],
  carbonyl: [["path", { d: "M0 2H8M0 6H8" }]],
  double: [["path", { d: "M2 0V8M6 0V8" }]],
  co_cn: [["path", { d: "M-1 -1L9 9M-1 7L1 9M7 -1L9 1" }]],
  oop: [["rect", { x: 1, y: 1, width: 2.5, height: 2.5 }], ["rect", { x: 5, y: 5, width: 2.5, height: 2.5 }]],
  heavy: [["path", { d: "M0 4H3M5 4H8M4 0V3M4 5V8" }]],
  artifact: [["path", { d: "M-1 9L9 -1M-1 1L1 -1M7 9L9 7M-1 -1L9 9" }]],
};

/** One pattern per family, drawn once in the chart's defs. @returns {SVGElement} */
function patterns() {
  const defs = svg("defs", {});
  for (const [family, parts] of Object.entries(INK)) {
    const p = svg("pattern", { id: `pat-${family}`, class: `fam-${family}`, width: 8, height: 8, patternUnits: "userSpaceOnUse" });
    p.append(svg("rect", { class: "region-ground", width: 8, height: 8 }));
    for (const [name, attr] of parts) p.append(svg(name, { class: "region-ink", ...attr }));
    defs.append(p);
  }
  return defs;
}

/**
 * The regions as vertical bands under the curve, each with a short label (clipped to its width, full name on hover and in the table). Bands that
 * overlap put their labels on different rows. The instrument zone is grey and says so.
 * @param {SVGElement} root @param {MarkBand[]} bands @param {{ min: number, max: number }} v @param {(x: number) => number} px @param {{ top: number, height: number }} box
 */
export function drawBands(root, bands, v, px, box) {
  root.append(patterns());
  /** @type {number[]} */
  const lanes = [];
  for (const g of [...bands].sort((a, b) => b.to - a.to)) {
    if (g.to < v.min || g.from > v.max) continue;
    const a = px(Math.min(g.to, v.max));
    const b = px(Math.max(g.from, v.min));
    const family = g.family in INK ? g.family : "artifact";
    const rect = svg("rect", { class: `region region-band fam-${family}`, x: a, y: box.top, width: b - a, height: box.height, fill: `url(#pat-${family})`, "data-region": g.id });
    const title = svg("title", {});
    title.textContent = `${bandName(g.id)} · ${formatNumber(g.from)}–${formatNumber(g.to)} cm⁻¹`;
    rect.append(title);
    root.append(rect);
    let lane = lanes.findIndex((end) => end <= a);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = b;
    const clip = svg("clipPath", { id: `clip-${g.id}` });
    clip.append(svg("rect", { x: a, y: box.top, width: b - a, height: box.height }));
    const label = svg("text", { class: "label region-label", x: a + 3, y: box.top + 11 + lane * LANE, "clip-path": `url(#clip-${g.id})`, "data-region-label": g.id });
    label.textContent = bandTag(g.id);
    root.append(clip, label);
  }
}

/** The window of a band rule picked in the peak card: an outlined frame with its range, drawn over the regions. @param {SVGElement} root @param {{ from: number, to: number, label: string }} rule @param {{ min: number, max: number }} v @param {(x: number) => number} px @param {{ top: number, height: number }} box */
export function drawRule(root, rule, v, px, box) {
  if (rule.to < v.min || rule.from > v.max) return;
  const a = px(Math.min(rule.to, v.max));
  const b = px(Math.max(rule.from, v.min));
  root.append(svg("rect", { class: "rule-range", x: a, y: box.top, width: b - a, height: box.height, "data-rule-window": "1" }));
  const label = svg("text", { class: "label rule-label", x: a + 3, y: box.top + box.height - 8 });
  label.textContent = rule.label;
  root.append(label);
}

/** @param {MarkPeak} p @param {number} cx @param {number} cy @returns {SVGElement} */
function marker(p, cx, cy) {
  const cls = `peak peak-${p.state}${p.shoulder ? " peak-shoulder" : ""}${p.focus ? " peak-focus" : ""}`;
  if (p.state === "minor") return svg("path", { class: cls, d: `M${cx} ${cy - 4}L${cx + 4} ${cy}L${cx} ${cy + 4}L${cx - 4} ${cy}Z`, "data-peak": p.id });
  return svg("circle", { class: cls, cx, cy, r: p.focus ? 6 : 4, "data-peak": p.id });
}

/** @param {SVGElement} root @param {MarkPeak[]} peaks @param {{ min: number, max: number }} v @param {(x: number) => number} px @param {(x: number) => number} pyAt screen y of the curve at a wavenumber */
export function drawPeaks(root, peaks, v, px, pyAt) {
  for (const p of peaks) {
    if (p.x < v.min || p.x > v.max) continue;
    const cx = px(p.x);
    const cy = pyAt(p.x) - 8;
    root.append(marker(p, cx, cy));
    if (!p.focus) continue;
    const label = svg("text", { class: "label peak-label", x: cx, y: cy - 10, "text-anchor": "middle" });
    label.textContent = approx(p.x);
    root.append(label);
  }
}

/** @param {string} agreement @returns {string} */
export function agreementWord(agreement) {
  return agreement === "agrees" ? t("peaks.agreement.agrees") : agreement === "partial" ? t("peaks.agreement.partial") : agreement === "disagrees" ? t("peaks.agreement.disagrees") : agreement === "low_signal" ? t("peaks.agreement.low_signal") : t("peaks.agreement.unknown");
}

/** The regions and the peaks as tables, after the data of the spectrum. @param {Marks} marks @returns {HTMLTableElement[]} */
export function marksTables(marks) {
  return [bandTable(marks.bands, marks.rows), peakTable(marks.rows, marks.name, marks.focus)];
}
