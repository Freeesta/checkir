// Merged views of the per-substance files: data/sources.json (shared) + data/substances/<id>/sources.json, and data/substances/<id>/aliases.json (old id -> id).
import { readFile, readdir } from "node:fs/promises";

/** @param {URL} url @returns {Promise<any>} the parsed file, or null when it is missing */
async function readJson(url) {
  try { return JSON.parse(await readFile(url, "utf8")); } catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return null; throw e; }
}

/** @param {URL} dataRoot @returns {Promise<string[]>} the substance folders, sorted */
async function substanceIds(dataRoot) {
  return (await readdir(new URL("substances/", dataRoot), { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

/** @param {URL} dataRoot @returns {Promise<any[]>} every source: the shared ones, then those of each substance */
export async function loadSources(dataRoot) {
  const all = [...((await readJson(new URL("sources.json", dataRoot)))?.sources ?? [])];
  for (const id of await substanceIds(dataRoot)) all.push(...((await readJson(new URL(`substances/${id}/sources.json`, dataRoot)))?.sources ?? []));
  return all;
}

/** @param {URL} dataRoot @returns {Promise<Record<string, string>>} old id -> id of the substance that lists it */
export async function loadAliases(dataRoot) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const id of await substanceIds(dataRoot)) for (const old of (await readJson(new URL(`substances/${id}/aliases.json`, dataRoot)))?.aliases ?? []) map[old] = id;
  return map;
}
