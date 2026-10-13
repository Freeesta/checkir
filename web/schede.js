// @ts-check
// Substance sheets of the public site: loading, the rule of what may be shown, and the text parser. No DOM here.

/** The ten fixed sections, in display order. */
export const SECTIONS = ["molecule", "category", "ftir_limits", "effects", "doses", "risks", "interactions", "harm_reduction", "sources", "license"];

/** Sections of health content: they appear only once a health reviewer has approved them. */
export const SANITARY = new Set(["effects", "doses", "risks", "interactions", "harm_reduction"]);

/** Marker of a section that is still a placeholder. */
const PENDING = /\[f:[a-z]+-section-pending\]/;

/** @typedef {{ id: string, names: Record<string, string>, version: number, section_state: Record<string, string>, reviewers: any[], reviewed: string, review_by: string, ai_assisted: boolean, texts: Record<string, Record<string, string>> }} Sheet */
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

/** @param {Sheet} sheet @param {string} key @returns {boolean} the section was signed off */
export function isApproved(sheet, key) {
  return sheet.section_state[key] === "approved" && sheet.reviewers.length > 0;
}

/**
 * What the page may do with a section: show its text, say it is in preparation, or say the review is not done yet.
 * A placeholder and a health section that is not approved never appear as content.
 * @param {Sheet} sheet @param {string} key @param {string} lang
 * @returns {"shown" | "preparing"}
 */
export function sectionStatus(sheet, key, lang) {
  const text = sectionText(sheet, key, lang);
  if (!text || PENDING.test(text)) return "preparing";
  if (SANITARY.has(key) && !isApproved(sheet, key)) return "preparing";
  return "shown";
}

/** Text of a section in the language, or in English when the language lacks it. @param {Sheet} sheet @param {string} key @param {string} lang @returns {string} */
export function sectionText(sheet, key, lang) {
  return (sheet.texts[lang]?.[key] ?? sheet.texts.en?.[key] ?? "").trim();
}

/** True when no section of the sheet is signed off: the whole sheet is a draft. @param {Sheet} sheet @returns {boolean} */
export function isDraft(sheet) {
  return SECTIONS.some((k) => !isApproved(sheet, k));
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
