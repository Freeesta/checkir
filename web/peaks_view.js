// @ts-check
import { formatNumber, t } from "./i18n.js";
import { bandName } from "./regions.js";

/**
 * What the chart says about the peaks in words and tables: the summary above the chart, the accessible name of a peak and the sortable peak
 * table (the table has exactly the peaks of the chart). The program proposes: every state is «explained by» a reference or it is not, nothing more.
 * @typedef {import("./peaks.js").PeakRow} PeakRow
 */

/** @param {number} x @returns {string} a position as the page shows it, whole and approximate */
export function approx(x) {
  return `~${formatNumber(Math.round(x))}`;
}

/** @param {string} state @returns {string} */
export function stateWord(state) {
  return state === "explained" ? t("peaks.state.explained") : state === "unexplained" ? t("peaks.state.unexplained") : state === "minor" ? t("peaks.state.minor") : state === "artifact" ? t("peaks.state.artifact") : t("peaks.state.plain");
}

/** @param {string} i @returns {string} */
export function intensityWord(i) {
  return i === "strong" ? t("peaks.intensity.strong") : i === "medium" ? t("peaks.intensity.medium") : t("peaks.intensity.weak");
}

/** @param {string | null} shape @returns {string} */
export function shapeWord(shape) {
  return shape === "narrow" ? t("peaks.shape.narrow") : shape === "medium" ? t("peaks.shape.medium") : shape === "broad" ? t("peaks.shape.broad") : shape === "very_broad" ? t("peaks.shape.very_broad") : t("peaks.shape.none");
}

/** The summary above the chart. @param {import("./peaks.js").Analysis} a @param {string | null} name the chosen candidate, null when none @returns {string} */
export function summaryText(a, name) {
  const extra = [a.minor ? t("peaks.summary.minor", { n: formatNumber(a.minor) }) : "", a.artifact ? t("peaks.summary.artifact", { n: formatNumber(a.artifact) }) : ""].filter(Boolean);
  const tail = extra.length ? ` · ${extra.join(" · ")}` : "";
  if (name === null) return `${t("peaks.summary.none", { main: formatNumber(a.main) })}${tail}`;
  const lost = a.peaks.filter((p) => p.state === "unexplained").map((p) => approx(p.position));
  const list = lost.length ? ` (${lost.join(", ")})` : "";
  return `${t("peaks.summary.with", { main: formatNumber(a.main), explained: formatNumber(a.explained), name, unexplained: formatNumber(a.unexplained) })}${list}${tail}`;
}

/** The accessible name of a peak, also what is announced when the arrows reach it. @param {PeakRow} p @param {string | null} name @returns {string} */
export function peakName(p, name) {
  const by = p.state === "explained" && (p.byName ?? name) ? t("peaks.name_by", { name: String(p.byName ?? name) }) : stateWord(p.state).toLowerCase();
  return t("peaks.name", { pos: formatNumber(Math.round(p.position)), intensity: intensityWord(p.intensity), state: by });
}

/** @typedef {"position" | "intensity" | "shape" | "state" | "by" | "region"} SortKey */
/** @type {{ key: SortKey, dir: 1 | -1 }} */
const sort = { key: "position", dir: -1 };
const RANK = { strong: 0, medium: 1, weak: 2 };

/** @param {PeakRow} p @param {SortKey} key @returns {number | string} */
function sortValue(p, key) {
  switch (key) {
    case "intensity": return RANK[p.intensity];
    case "shape": return p.shape ?? "";
    case "state": return p.state;
    case "by": return p.by ?? -1;
    case "region": return p.regions[0] ?? "";
    default: return p.position;
  }
}

/** @param {PeakRow[]} rows @returns {PeakRow[]} */
function sorted(rows) {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : b.position - a.position) * sort.dir;
  });
}

/** @param {PeakRow} p @param {string | null} name @param {string | null} focus @returns {HTMLTableRowElement} */
function rowOf(p, name, focus) {
  const tr = document.createElement("tr");
  tr.dataset.peak = p.id;
  if (p.id === focus) tr.setAttribute("aria-current", "true");
  const by = p.by === null ? "—" : `${approx(p.by)}${p.byName ?? name ? ` · ${p.byName ?? name}` : ""}`;
  const cells = [`${approx(p.position)}${p.shoulder ? ` (${t("peaks.shoulder")})` : ""}`, intensityWord(p.intensity), shapeWord(p.shape), stateWord(p.state), by, p.regions.map(bandName).join(", ") || "—"];
  for (const c of cells) tr.insertCell().textContent = c;
  return tr;
}

/** The peaks of the chart as a table, sortable by every column (buttons in the headers, `aria-sort` on the active one). @param {PeakRow[]} rows @param {string | null} name @param {string | null} focus @returns {HTMLTableElement} */
export function peakTable(rows, name, focus) {
  const tab = document.createElement("table");
  tab.className = "peak-table";
  tab.createCaption().textContent = t("table.peaks_caption");
  const head = tab.createTHead().insertRow();
  /** @type {Array<[SortKey, string]>} */
  const cols = [["position", t("table.wavenumber")], ["intensity", t("table.peak_intensity")], ["shape", t("table.peak_shape")], ["state", t("table.peak_state")], ["by", t("table.peak_by")], ["region", t("table.peak_region")]];
  for (const [key, label] of cols) {
    const th = document.createElement("th");
    th.scope = "col";
    th.setAttribute("aria-sort", sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sort";
    b.textContent = label;
    b.addEventListener("click", () => {
      sort.dir = sort.key === key ? /** @type {1 | -1} */ (-sort.dir) : 1;
      sort.key = key;
      const next = peakTable(rows, name, focus);
      tab.replaceWith(next);
      /** @type {HTMLElement | null} */ (next.querySelector(`th:nth-child(${cols.findIndex((c) => c[0] === key) + 1}) button`))?.focus();
    });
    th.append(b);
    head.append(th);
  }
  const body = tab.createTBody();
  for (const p of sorted(rows)) body.append(rowOf(p, name, focus));
  return tab;
}

/** The regions of the chart as a table: range and how many peaks fall in each. @param {import("./regions.js").Band[]} bands @param {PeakRow[]} rows @returns {HTMLTableElement} */
export function bandTable(bands, rows) {
  const tab = document.createElement("table");
  tab.createCaption().textContent = t("table.bands_caption");
  const head = tab.createTHead().insertRow();
  for (const h of [t("table.region_col"), t("table.region_range"), t("table.band_count")]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    head.append(th);
  }
  const body = tab.createTBody();
  for (const g of bands) {
    const r = body.insertRow();
    r.insertCell().textContent = bandName(g.id);
    r.insertCell().textContent = `${formatNumber(g.from)}–${formatNumber(g.to)}`;
    r.insertCell().textContent = formatNumber(rows.filter((p) => p.regions.includes(g.id)).length);
  }
  return tab;
}
