// @ts-check
import { candidateName } from "./results.js";
import { axisKind } from "./spectrum.js";

/**
 * Local export of what is on screen: CSV text of the spectrum shown, of its peaks and of the candidates of the comparison. Everything is
 * built from the page's memory and handed to the browser as a download; file names are the local code (C1, C1-r1), never the name
 * of the original file. Spectral data of a library is never written here: only the sample's own points and the comparison's numbers.
 */

/** One CSV field: quoted when it holds a comma, a quote or a line break. @param {unknown} v @returns {string} */
function field(v) {
  const text = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** @param {unknown[][]} rows @returns {string} CSV with a final newline */
export function toCsv(rows) {
  return rows.map((r) => r.map(field).join(",")).join("\n") + "\n";
}

/** The points of a spectrum, numbers in the machine form (dot decimal). @param {import("./spectrum.js").Spectrum} s @param {{ min: number, max: number }} [view] limit to a range @returns {string} */
export function spectrumCsv(s, view) {
  const unit = axisKind(s);
  const rows = /** @type {unknown[][]} */ ([["wavenumber_cm1", unit]]);
  s.wavenumber_cm1.forEach((x, i) => {
    if (!view || (x >= view.min && x <= view.max)) rows.push([x, s.y[i]]);
  });
  return toCsv(rows);
}

/** @param {import("./peaks.js").PeakRow[]} peaks @returns {string} */
export function peaksCsv(peaks) {
  return toCsv([["position_cm1", "intensity", "state", "explained_by_cm1", "delta_cm1", "group", "mode"], ...peaks.map((p) => [p.position, p.intensity, p.state, p.by, p.delta, p.group, p.mode])]);
}

/** @param {any[]} candidates the candidates of a comparison result @returns {string} */
export function candidatesCsv(candidates) {
  return toCsv([["rank", "name", "form", "library", "r_derivative", "coverage"], ...candidates.map((c) => [c.rank, candidateName(c), c.form, c.library, c.r_derivative, c.coverage])]);
}

/** Offer a text or a file as a local download (nothing leaves the browser). @param {string} name @param {BlobPart} data @param {string} [type] */
export function download(name, data, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
