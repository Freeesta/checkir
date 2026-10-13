// @ts-check
// Substance sheets of the public site: loading, the rule of what may be shown, the hook from a library entry to a sheet, and the text parser. No DOM here.
import { normalize } from "./nomi.js";

/** The thirteen fixed sections, in display order (`tools/dati/controlla_schede.py` has the same list). */
export const SECTIONS = ["molecule", "category", "history", "origin", "metabolism", "cuts", "effects", "doses", "risks", "interactions", "counselling", "sources", "license"];
/** Sections of a family sheet; a substance sheet takes them from its family where its own is empty. */
export const FAMILY_SECTIONS = ["effects", "risks", "interactions", "counselling", "sources", "license"];

/** Marker of a section that is still a placeholder. */
const PENDING = /\[f:[a-z]+-section-pending\]/;

/**
 * @typedef {{ formula?: string, molar_mass_g_mol?: number, smiles?: string, inchikey?: string, iupac?: string, cas?: string }} Identity
 * @typedef {{ id: string, names: Record<string, string>, version: number, section_state: Record<string, string>, reviewers: any[], reviewed: string, review_by: string, ai_assisted: boolean, texts: Record<string, Record<string, string>>,
 *   identity?: Identity, classes?: { chemical?: string[], effect?: string[] }, structure?: boolean, family?: string, origin?: any, metabolism?: any, cuts?: Array<{ cut: string, frequency: string, source: string }>,
 *   counselling?: Array<{ key: string, topic: string, source: string }>, interactions?: any[] }} Sheet
 * @typedef {{ id: string, names: Record<string, string>, version: number, section_state: Record<string, string>, reviewers: any[], reviewed: string, review_by: string, ai_assisted: boolean, texts: Record<string, Record<string, string>>, interactions?: any[], counselling?: any[] }} FamilySheet
 * @typedef {{ id: string, names: Record<string, string>, terms: string[], classes: { chemical?: string[], effect?: string[] }, signed: number, family?: string }} IndexEntry
 * @typedef {{ keys: string[], public: boolean, sheet?: string }} CutInfo
 * @typedef {{ sheets: string[], entries: IndexEntry[], families: Array<{ id: string, names: Record<string, string> }>, cuts: Record<string, CutInfo> }} SheetIndex
 */
/** @typedef {{ title: string, url?: string, doi?: string, year?: number }} Source */

/** @type {Map<string, Promise<Sheet | null>>} */
const sheets = new Map();
/** @type {Promise<Record<string, Source>> | null} */
let sources = null;

/** @param {string} path @returns {Promise<any>} */
async function getJson(path) {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(path);
  return res.json();
}

/** @type {SheetIndex | null} the index of the sheets, once read */
let index = null;
/** @type {Map<string, string | null> | null} lookup key -> sheet id (null when two sheets share the key) */
let names = null;

/** Read the index and the names of the sheets once; `done` runs when they are known (the buttons that open a sheet depend on them). @param {() => void} [done] */
export function loadSheetIndex(done) {
  if (index) return;
  Promise.all([getJson("schede/index.json"), getJson("schede/names.json")])
    .then(([i, n]) => {
      index = { sheets: Array.isArray(i.sheets) ? i.sheets : [], entries: i.entries ?? [], families: i.families ?? [], cuts: i.cuts ?? {} };
      names = new Map(Object.entries(n.names ?? {}));
    })
    .catch(() => {
      index = { sheets: [], entries: [], families: [], cuts: {} };
      names = new Map();
    })
    .then(() => done?.());
}

/** The index of the sheets (empty until it is read). @returns {SheetIndex} */
export function sheetIndex() {
  return index ?? { sheets: [], entries: [], families: [], cuts: {} };
}

/** Does the site have a sheet for this substance? false until the index is read. @param {string} id @returns {boolean} */
export function hasSheet(id) {
  return index?.sheets.includes(id) ?? false;
}

/** Words that name a form of a substance (salt, base, hydrate) and not the substance itself. */
const FORM_WORDS = new Set(["hcl", "hydrochloride", "chloride", "cloridrato", "hbr", "hydrobromide", "bromidrato", "sulfate", "sulphate", "solfato", "phosphate", "fosfato", "tartrate", "tartrato", "citrate", "citrato", "maleate", "maleato", "fumarate", "fumarato", "nitrate", "nitrato", "acetate", "acetato", "base", "freebase", "free", "salt", "sale", "hydrate", "hemihydrate", "monohydrate", "dihydrate", "anhydrous", "idrato", "monoidrato", "anidro"]);

/** The key a name is looked up by: without case, accents, punctuation and the words of a salt or hydrate ("Cocaine HCl" and "Cocaina cloridrato" give "cocaine" and "cocaina"). @param {string} name @returns {string} */
export function sheetKey(name) {
  return normalize(name).replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w && !FORM_WORDS.has(w)).join(" ");
}

/**
 * The sheet of a library entry: its own substance id when the site has that sheet, else the name (as written and without salt words), the substance
 * label of an imported file or the InChIKey against the names of the sheets. Two sheets for one entry mean no hook. Everything runs here.
 * @param {{ substance?: string, names?: Record<string, string | undefined>, inchikey?: string } | null | undefined} row @returns {string | null}
 */
export function sheetIdFor(row) {
  if (!row || !names) return null;
  if (row.substance && hasSheet(row.substance)) return row.substance;
  const keys = [row.substance, ...Object.values(row.names ?? {}), row.inchikey].flatMap((n) => (n ? [normalize(n), sheetKey(n)] : []));
  const hits = new Set(keys.filter((k) => names?.has(k)).map((k) => names?.get(k) ?? ""));
  const [only] = [...hits];
  return hits.size === 1 && only ? only : null;
}

/** The sheet of a substance, or null when the site has none (or it cannot be read). @param {string} id @returns {Promise<Sheet | null>} */
export function loadSheet(id) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return Promise.resolve(null);
  if (!sheets.has(id)) sheets.set(id, getJson(`schede/${id}.json`).catch(() => null));
  return /** @type {Promise<Sheet | null>} */ (sheets.get(id));
}

/** The sources the sheets cite. @returns {Promise<Record<string, Source>>} */
export function loadSources() {
  sources ??= getJson("schede/sources.json").catch(() => ({}));
  return sources;
}

/** @type {Map<string, Promise<FamilySheet | null>>} */
const families = new Map();

/** The family sheet with this id (a class id), or null. @param {string} id @returns {Promise<FamilySheet | null>} */
export function loadFamily(id) {
  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(id)) return Promise.resolve(null);
  if (!families.has(id)) families.set(id, getJson(`schede/famiglia-${id}.json`).catch(() => null));
  return /** @type {Promise<FamilySheet | null>} */ (families.get(id));
}

/** @type {Promise<Record<string, { axis: string, names: Record<string, string> }>> | null} */
let classes = null;

/** Names of the chemical and effect classes (for the filter of the list). @returns {Promise<Record<string, { axis: string, names: Record<string, string> }>>} */
export function loadClasses() {
  classes ??= getJson("schede/classes.json").catch(() => ({}));
  return classes;
}

/** @param {Sheet | FamilySheet} sheet @param {string} key @returns {boolean} the section was signed off */
export function isApproved(sheet, key) {
  return sheet.section_state[key] === "approved" && sheet.reviewers.length > 0;
}

/**
 * Whether a section has text to show; a placeholder ("not written yet") counts as empty. The state of a section is data, not a gate.
 * @param {Sheet | FamilySheet} sheet @param {string} key @param {string} lang
 * @returns {"shown" | "empty"}
 */
export function sectionStatus(sheet, key, lang) {
  const text = sectionText(sheet, key, lang);
  return !text || PENDING.test(text) ? "empty" : "shown";
}

/** Text of a section in the language, or in English when the language lacks it. @param {Sheet | FamilySheet} sheet @param {string} key @param {string} lang @returns {string} */
export function sectionText(sheet, key, lang) {
  return (sheet.texts[lang]?.[key] ?? sheet.texts.en?.[key] ?? "").trim();
}

/**
 * Splits a text into paragraphs of parts: plain text or a citation `[f:id]` numbered in order of first appearance.
 * @param {string} text @param {string[]} order ids already numbered (updated)
 * @returns {Array<Array<{ text: string } | { ref: string, n: number }>>}
 */
export function parseParagraphs(text, order) {
  return text.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => {
    /** @type {Array<{ text: string } | { ref: string, n: number }>} */
    const parts = [];
    let last = 0;
    for (const m of p.matchAll(/\s*\[f:([a-z0-9-]+)\]/g)) {
      if (m.index > last) parts.push({ text: p.slice(last, m.index) });
      if (!order.includes(m[1])) order.push(m[1]);
      parts.push({ ref: m[1], n: order.indexOf(m[1]) + 1 });
      last = m.index + m[0].length;
    }
    if (last < p.length) parts.push({ text: p.slice(last) });
    return parts;
  });
}
