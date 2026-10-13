// Copies the substance sheets (data/substances/*/datasheet) into site/schede/ as one JSON bundle per substance,
// plus the index (list page, cuts), the names used to hook a sheet to a library entry, the family sheets and the sources they cite.
// Only public data: the page loads these files on request, never anything else.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { sheetKey } from "../web/schede.js";
import { normalize } from "../web/nomi.js";

const root = new URL("../", import.meta.url);
const SECTION = /^## ([a-z_]+)\s*$/;
/** The thirteen sections of a sheet; `signed` counts the approved ones among them. */
export const SECTIONS = ["molecule", "category", "history", "origin", "metabolism", "cuts", "effects", "doses", "risks", "interactions", "counselling", "sources", "license"];
/** Fields of datasheet.json that the page reads besides the texts. */
const EXTRA = ["family", "origin", "metabolism", "cuts", "counselling", "interactions", "identity_extra"];

/** Splits texts.<lang>.md into {section: text}. @param {string} md */
export function parseTexts(md) {
  /** @type {Record<string, string>} */
  const sections = {};
  let key = null;
  let buf = [];
  const flush = () => { if (key) sections[key] = buf.join("\n").trim(); };
  for (const line of md.split("\n")) {
    const m = SECTION.exec(line);
    if (m) { flush(); key = m[1]; buf = []; } else buf.push(line);
  }
  flush();
  return sections;
}

const json = async (url) => JSON.parse(await readFile(url, "utf8"));
const text = async (url) => { try { return await readFile(url, "utf8"); } catch { return null; } };
const dirs = async (url) => { try { return (await readdir(url, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };

/** Texts of the languages that exist. @param {URL} dir */
async function readTexts(dir) {
  const texts = {};
  for (const lang of ["en", "it"]) {
    const md = await text(new URL(`texts.${lang}.md`, dir));
    if (md !== null) texts[lang] = parseTexts(md);
  }
  return texts;
}

/** Every key a name can be looked up by (the name as it is and without salt words). @param {Iterable<string>} names @returns {string[]} */
export function keysOf(names) {
  const out = new Set();
  for (const n of names) {
    if (!n) continue;
    out.add(normalize(n));
    out.add(sheetKey(n));
  }
  out.delete("");
  return [...out];
}

/** Names, synonyms, InChIKeys and form ids of a substance, as lookup keys. @param {any} substance @param {any[]} forms */
function lookupKeys(substance, forms) {
  const names = Object.values(substance.names).flatMap((n) => [n.preferred, ...(n.synonyms ?? [])]);
  const keys = new Set(keysOf([substance.id, ...names, ...forms.map((f) => f.id)]));
  for (const k of [substance.inchikey, ...forms.map((f) => f.inchikey_form)]) if (k) keys.add(normalize(k));
  return [...keys];
}

/** The bundle of a substance sheet. @param {string} id @param {any} datasheet @param {any} substance @param {any} texts @param {boolean} structure */
export function bundleOf(id, datasheet, substance, texts, structure) {
  const { version, section_state, reviewers, reviewed, review_by, ai_assisted } = datasheet;
  const names = Object.fromEntries(Object.entries(substance.names).map(([l, n]) => [l, n.preferred]));
  const identity = { formula: substance.formula, molar_mass_g_mol: substance.molar_mass_g_mol, smiles: substance.smiles, inchikey: substance.inchikey, iupac: substance.iupac, cas: substance.external_ids?.cas };
  const extra = Object.fromEntries(EXTRA.filter((k) => datasheet[k] !== undefined && datasheet[k] !== null).map((k) => [k, datasheet[k]]));
  return { id, names, version, section_state, reviewers, reviewed, review_by, ai_assisted, texts, identity, classes: substance.classes, ...(structure ? { structure: true } : {}), ...extra };
}

/** Number of sections signed off (approved by at least one reviewer), as the page counts them. @param {any} d */
export function signedCount(d) {
  return d.reviewers.length ? SECTIONS.filter((k) => d.section_state[k] === "approved").length : 0;
}

/** Everything the site needs, as { relative path: text }. @param {URL} dataRoot the folder that holds substances/, families/, sources.json, tagli.json, classes.json, aliases.json */
export async function collect(dataRoot) {
  const files = new Map();
  const entries = [];
  const names = new Map();
  const keysOfSubstance = new Map();
  const put = (key, id) => names.set(key, names.has(key) && names.get(key) !== id ? null : id);
  const aliases = (await json(new URL("aliases.json", dataRoot)).catch(() => ({ aliases: {} }))).aliases;
  for (const id of await dirs(new URL("substances/", dataRoot))) {
    const dir = new URL(`substances/${id}/datasheet/`, dataRoot);
    let datasheet;
    try { datasheet = await json(new URL("datasheet.json", dir)); } catch { continue; }
    const base = new URL(`substances/${id}/`, dataRoot);
    const substance = await json(new URL("substance.json", base));
    const forms = [];
    for (const f of await readdir(new URL("forms/", base)).catch(() => [])) if (f.endsWith(".json")) forms.push(await json(new URL(`forms/${f}`, base)));
    const svg = await text(new URL("structure.svg", base));
    const spectra = (await readdir(new URL("spectra/", base)).catch(() => [])).some((f) => f.endsWith(".json"));
    files.set(`${id}.json`, JSON.stringify(bundleOf(id, datasheet, substance, await readTexts(dir), svg !== null)));
    if (svg !== null) files.set(`${id}.svg`, svg);
    const keys = lookupKeys(substance, forms);
    for (const k of keys) put(k, id);
    keysOfSubstance.set(id, { keys, spectra });
    entries.push({ id, names: Object.fromEntries(Object.entries(substance.names).map(([l, n]) => [l, n.preferred])), terms: keysOf(Object.values(substance.names).flatMap((n) => [n.preferred, ...(n.synonyms ?? [])])), classes: substance.classes, signed: signedCount(datasheet), ...(datasheet.family ? { family: datasheet.family } : {}) });
  }
  for (const [old, now] of Object.entries(aliases)) for (const k of keysOf([old])) put(k, now);
  const families = [];
  const classes = (await json(new URL("classes.json", dataRoot)).catch(() => ({ classes: [] }))).classes;
  for (const id of await dirs(new URL("families/", dataRoot))) {
    const dir = new URL(`families/${id}/`, dataRoot);
    const fam = await json(new URL("family.json", dir)).catch(() => null);
    if (!fam) continue;
    const cls = classes.find((c) => c.id === id);
    const { version, section_state, reviewers, reviewed, review_by, ai_assisted, interactions, counselling } = fam;
    files.set(`famiglia-${id}.json`, JSON.stringify({ id, names: cls?.names ?? { en: id }, version, section_state, reviewers, reviewed, review_by, ai_assisted, interactions, counselling, texts: await readTexts(dir) }));
    families.push({ id, names: cls?.names ?? { en: id } });
  }
  const tagli = (await json(new URL("tagli.json", dataRoot)).catch(() => ({ cuts: [] }))).cuts;
  const cuts = {};
  const cutIds = new Set([...tagli.map((c) => c.id), ...[...files.keys()].filter((k) => k.endsWith(".json")).flatMap((k) => (JSON.parse(files.get(k)).cuts ?? []).map((c) => c.cut))]);
  for (const cid of cutIds) {
    const cut = tagli.find((c) => c.id === cid);
    const sub = keysOfSubstance.get(cut?.sheet ?? cid) ?? keysOfSubstance.get(cid);
    cuts[cid] = { keys: [...new Set([...keysOf(cut?.names ?? []), ...(sub?.keys ?? [])])], public: Boolean(sub?.spectra), ...(entries.some((e) => e.id === (cut?.sheet ?? cid)) ? { sheet: cut?.sheet ?? cid } : {}) };
  }
  const all = (await json(new URL("sources.json", dataRoot))).sources;
  files.set("sources.json", JSON.stringify(Object.fromEntries(all.map((s) => [s.id, { title: s.title, ...(s.url ? { url: s.url } : {}), ...(s.doi ? { doi: s.doi } : {}), ...(s.year ? { year: s.year } : {}) }]))));
  files.set("names.json", JSON.stringify({ schema: "sheets-names/1", names: Object.fromEntries([...names].sort(([a], [b]) => (a < b ? -1 : 1))) }));
  files.set("classes.json", JSON.stringify(Object.fromEntries(classes.map((c) => [c.id, { axis: c.axis, names: c.names }]))));
  files.set("index.json", JSON.stringify({ schema: "sheets-index/1", sheets: entries.map((e) => e.id), entries, families, cuts }));
  return files;
}

async function main() {
  const out = new URL("site/schede/", root);
  await mkdir(out, { recursive: true });
  const files = await collect(new URL("data/", root));
  for (const [name, body] of files) await writeFile(new URL(name, out), body);
  console.log(`schede: ${JSON.parse(files.get("index.json")).sheets.length} sheets`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
