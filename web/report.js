// @ts-check
import { matchScore } from "./candidati.js";
import { chainLine, levelWord, shownLevel } from "./alerts.js";
import { chosenCandidates } from "./decision.js";
import { candidatesCsv, download, peaksCsv, spectrumCsv } from "./export.js";
import { spectrumOf } from "./files.js";
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { mixtureComponents } from "./mixture.js";
import { analyse } from "./peaks.js";
import { candidateName, LISTED } from "./results.js";
import { activeFile, decisionOf, getState, resultOf } from "./state.js";

/**
 * The chemist's report (key `e` writes the CSV files, the menu and the button print this): one A4 page with what the chemist needs to stand behind the
 * result — the spectrum, the chain and libraries with versions, the region, the candidates, the unexplained peaks, the decision and the signature
 * line. Built from the page's memory into the hidden `#report-host`, printed, then emptied; nothing is stored or sent.
 */

/** @param {string} label @param {string} value @returns {HTMLElement[]} */
const row = (label, value) => [el("dt", {}, [label]), el("dd", {}, [value])];

/** @param {import("./state.js").AppState} s @returns {HTMLElement | null} null when no spectrum is shown */
export function buildReport(s) {
  const file = activeFile(s);
  const sample = file ? spectrumOf(file.code) : undefined;
  if (!file || !sample) return null;
  const result = resultOf(s);
  const level = shownLevel(s);
  const facts = row(t("report.code"), file.code);
  facts.push(...row(t("report.range"), t("report.range_value", { from: formatNumber(Math.min(...sample.wavenumber_cm1)), to: formatNumber(Math.max(...sample.wavenumber_cm1)), n: formatNumber(sample.y.length) })));
  if (result) facts.push(...row(t("report.chain"), chainLine(result.data)), ...row(t("report.level"), level === null ? "" : levelWord(level)));
  /** @type {HTMLElement[]} */
  const parts = [el("h2", {}, [t("report.title")]), el("dl", { class: "report-facts" }, facts)];
  if (result) parts.push(candidatesBlock(result.data), ...mixtureBlock(result.data), ...decisionBlock(s));
  const peaks = unexplained(s);
  if (peaks.length) parts.push(el("h3", {}, [t("report.unexplained")]), el("p", {}, [peaks.map((p) => `~${formatNumber(Math.round(p.position))}`).join(" · ")]));
  parts.push(el("p", { class: "report-sign" }, [t("report.signature")]), el("div", { class: "report-line" }));
  return el("section", { class: "report" }, parts);
}

/** @param {any} data @returns {HTMLElement} */
function candidatesBlock(data) {
  const head = el("tr", {}, [t("report.col_rank"), t("report.col_name"), t("report.col_form"), t("report.col_library"), t("report.col_r"), t("report.col_coverage")].map((name) => el("th", { scope: "col" }, [name])));
  const rows = (data.candidates ?? []).slice(0, LISTED).map((/** @type {any} */ c) => el("tr", {}, [formatNumber(c.rank), candidateName(c), c.form, c.library, formatNumber(matchScore(c.r_derivative)), formatNumber(c.coverage * 100)].map((v) => el("td", {}, [String(v)]))));
  return el("div", {}, [el("h3", {}, [t("report.candidates")]), el("table", { class: "report-table" }, [el("thead", {}, [head]), el("tbody", {}, rows)])]);
}

/** The mixture the program proposed: one row per component with its contribution to the spectrum and the main peaks it explains. @param {any} data @returns {HTMLElement[]} */
function mixtureBlock(data) {
  const parts = mixtureComponents(data);
  if (!parts.length) return [];
  const head = el("tr", {}, [t("report.col_name"), t("report.col_library"), t("report.col_contribution"), t("report.col_explained")].map((name) => el("th", { scope: "col" }, [name])));
  const rows = parts.map((c) => el("tr", {}, [candidateName({ library: c.library, spectrum_id: c.id, display_name: c.name }), c.library, formatNumber(c.contribution, 2), c.explained === null ? "—" : formatNumber(c.explained)].map((v) => el("td", {}, [String(v)]))));
  return [el("h3", {}, [t("report.mixture")]), el("table", { class: "report-table", "data-report": "mixture" }, [el("thead", {}, [head]), el("tbody", {}, rows)]), el("p", {}, [t("mixture.unexplained", { n: formatNumber(data.mixture.unexplained ?? 0) })])];
}

/** @param {import("./state.js").AppState} s @returns {HTMLElement[]} */
function decisionBlock(s) {
  const d = decisionOf(s);
  const data = resultOf(s)?.data;
  if (!d || !data) return [];
  const names = chosenCandidates(d, data).map((/** @type {any} */ c) => candidateName(c));
  return [el("h3", {}, [t("report.decision")]), el("p", {}, [`${levelWord(d.level)}${names.length ? ` · ${names.join(", ")}` : ""}`])];
}

/** @param {import("./state.js").AppState} s @returns {import("./peaks.js").PeakRow[]} */
function unexplained(s) {
  const a = s.showPeaks ? analyse(s) : null;
  return a ? a.peaks.filter((p) => p.state === "unexplained") : [];
}

/** The two exports as page actions. @param {(text: string) => void} announce */
export function exportActions(announce) {
  return {
    exportCsv: () => {
      const s = getState();
      const file = activeFile(s);
      const sample = file ? spectrumOf(file.code) : undefined;
      if (!file || !sample) return;
      download(`${file.code}.csv`, spectrumCsv(sample));
      const a = s.showPeaks ? analyse(s) : null;
      if (a?.peaks.length) download(`${file.code}-peaks.csv`, peaksCsv(a.peaks));
      const data = resultOf(s)?.data;
      if (data?.candidates?.length) download(`${file.code}-candidates.csv`, candidatesCsv(data.candidates));
      announce(t("status.exported", { code: file.code }));
    },
    exportReport: () => {
      const host = document.getElementById("report-host");
      const report = host ? buildReport(getState()) : null;
      if (!host || !report) return;
      host.replaceChildren(report);
      document.body.dataset.printing = "report";
      const done = () => {
        delete document.body.dataset.printing;
        host.replaceChildren();
        window.removeEventListener("afterprint", done);
      };
      window.addEventListener("afterprint", done);
      window.print();
    },
  };
}
