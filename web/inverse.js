// @ts-check
import { currentLang } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { peakIndexStatus, searchPeaks } from "./match.js";

/**
 * Inverse search: which spectra of the active libraries have a band here? The engine answers on the peak index (`peak-index/1`) with row numbers
 * per library; this module builds the query, merges the libraries and groups the spectra by substance. It says nothing about identity or level.
 * @typedef {{ position: number, tolerance: number | null }} Wanted
 * @typedef {{ from: number, to: number }} Absent
 * @typedef {{ wanted: Wanted[], absent: Absent[], minFound: number | null }} InverseSpec
 * @typedef {{ wanted: number, position: number, prominence: number, delta: number, width: string }} HitBand
 * @typedef {{ library: string, spectrumId: string, form: string, found: number, prominence: number, delta: number, bands: HitBand[] }} InverseHit
 * @typedef {{ key: string, name: string, hits: InverseHit[] }} InverseGroup
 * @typedef {{ groups: InverseGroup[], spectra: number, truncated: boolean, building: Array<{ id: string, done: number, total: number }>, failed: boolean }} InverseResult
 */

/** @param {InverseSpec} spec @returns {Record<string, unknown>} the query of `peak_index_query` */
export function toQuery(spec) {
  /** @type {Record<string, unknown>} */
  const q = {
    peaks: spec.wanted.map((w) => (w.tolerance === null ? { position_cm1: w.position } : { position_cm1: w.position, tolerance_cm1: w.tolerance })),
    absent: spec.absent.map((a) => ({ from_cm1: a.from, to_cm1: a.to })),
  };
  if (spec.minFound !== null && spec.minFound < spec.wanted.length) q.min_found = spec.minFound;
  return q;
}

/** @param {string} lib @param {any} hit one hit of the engine @returns {InverseHit | null} */
function hitOf(lib, hit) {
  const row = libraryRows(lib)?.[hit.spectrum];
  if (!row) return null;
  /** @type {HitBand[]} */
  const bands = hit.bands.map((/** @type {any} */ b) => ({ wanted: b.wanted, position: b.position_cm1, prominence: b.prominence_rel, delta: b.delta_cm1, width: b.width }));
  const sum = (/** @type {(b: HitBand) => number} */ f) => bands.reduce((acc, b) => acc + f(b), 0);
  return { library: lib, spectrumId: row.id, form: row.form ?? "", found: hit.found, prominence: sum((b) => b.prominence), delta: sum((b) => b.delta), bands };
}

/** @param {string} lib @param {string} id @returns {{ key: string, name: string }} the substance a spectrum belongs to */
function substanceOf(lib, id) {
  const row = libraryRows(lib)?.find((r) => r.id === id);
  const name = row ? (row.names[currentLang() === "it" ? "it" : "en"] ?? row.names.en) : id;
  return { key: `${lib}/${row?.substance ?? id}`, name };
}

/**
 * Run the query on the active libraries. The groups keep the order of their best spectrum; the spectra of a group (forms, salts) follow it.
 * @param {InverseSpec} spec
 * @returns {Promise<InverseResult>}
 */
export async function runInverse(spec) {
  const answer = await searchPeaks(toQuery(spec));
  /** @type {InverseResult} */
  const out = { groups: [], spectra: 0, truncated: false, building: [], failed: answer === null };
  if (!answer) return out;
  out.building = answer.missing.map((id) => ({ id, done: peakIndexStatus(id)?.done ?? 0, total: peakIndexStatus(id)?.total ?? 0 }));
  const parsed = JSON.parse(answer.json);
  if (parsed.error_key) return { ...out, failed: true };
  out.failed = parsed.failed > 0;
  out.truncated = parsed.truncated;
  // The engine merged the libraries and ordered the hits (bands found, prominence, distance); the page keeps that order.
  const hits = parsed.hits.map((/** @type {any} */ h) => hitOf(h.lib, h)).filter((/** @type {InverseHit | null} */ h) => h !== null);
  out.spectra = hits.length;
  /** @type {Map<string, InverseGroup>} */
  const groups = new Map();
  for (const hit of hits) {
    const who = substanceOf(hit.library, hit.spectrumId);
    const group = groups.get(who.key) ?? { key: who.key, name: who.name, hits: [] };
    group.hits.push(hit);
    groups.set(who.key, group);
  }
  out.groups = [...groups.values()];
  return out;
}
