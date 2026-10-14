// @ts-check
// Loading of the theory content (one chapter at a time, only when it is opened) and the inline markup of the texts.
import { el } from "../dom.js";

/**
 * @typedef {{ id: string, label: string, text: string, value: string, params?: number[] }} Item
 * @typedef {{ id: string, labels: Record<string, string>, items?: Item[] }} Interactive
 * @typedef {{ caption: string, columns: string[], rows: string[][] }} DataTable
 * @typedef {{ id: string, alt: string, caption: string, labels?: Record<string, string>, data_table?: DataTable }} Figure
 * @typedef {{ schema: string, id: string, n: number, title: string, key_message: string, body: string[], for_chemists: string[], figure: Figure, interactive?: Interactive, further_reading: string[], sources: string[], glossary_terms: string[] }} Chapter
 * @typedef {{ id: string, term: string, term_other_lang: string, definition: string, see_also: string[] }} Entry
 * @typedef {{ id: string, type: string, title: string, url?: string, license?: string }} Source
 * @typedef {{ n: number, id: string, slug: string, title: string }} IndexEntry
 */

/** @type {Map<string, Promise<any>>} */
const cache = new Map();

/**
 * Fetch a JSON file of the section once.
 * @param {string} path relative to the `teoria/` folder
 * @returns {Promise<any>}
 */
export function loadJson(path) {
  let p = cache.get(path);
  if (!p) {
    p = fetch(new URL(path, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** @param {string} lang @returns {Promise<{ chapters: IndexEntry[] }>} */
export const loadIndex = (lang) => loadJson(`${lang}/indice.json`);

/** @param {string} lang @param {IndexEntry} entry @returns {Promise<Chapter>} */
export const loadChapter = (lang, entry) => loadJson(`${lang}/${entry.slug}.json`);

/** @param {string} lang @returns {Promise<{ entries: Entry[] }>} */
export const loadGlossary = (lang) => loadJson(`${lang}/glossario.json`);

/** @returns {Promise<{ sources: Source[] }>} */
export const loadSources = () => loadJson("fonti.json");

/**
 * Text with links to the glossary: `[[term-id|shown text]]` becomes `<a href="#g-term-id">`. Text only, never HTML.
 * @param {string} text
 * @returns {Array<Node | string>}
 */
export function inline(text) {
  /** @type {Array<Node | string>} */
  const out = [];
  let rest = text;
  for (;;) {
    const m = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push(rest.slice(0, m.index));
    out.push(el("a", { href: `#g-${m[1]}`, class: "term" }, [m[2]]));
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

/** The text without the link markup (for titles and live regions). @param {string} text @returns {string} */
export function plain(text) {
  return text.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1");
}

/** Replace `{name}` in a content label. @param {string} text @param {Record<string, string>} [params] @returns {string} */
export function fill(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}
