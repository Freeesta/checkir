// @ts-check
// "Propose a change" to a substance sheet: local checks and the pre-filled issue link. No DOM, no network: the page only builds the
// address; the browser opens it on the user's click. Nothing of the sample or of the analysis ever enters here.
import { GITHUB_URL } from "./appname.js";

/** Issue form that receives the proposals. */
const TEMPLATE = "sheet.yml";
/** Longest address sent to GitHub; a longer one carries the text through the clipboard. */
export const MAX_URL = 6000;
/** Longest proposed text, in characters. */
export const MAX_TEXT = 4000;

/** Sections whose every point needs a source. */
export const HEALTH = new Set(["effects", "doses", "risks", "interactions"]);

/** Words that must never reassure (same list as tools/check_words.py), by language. @type {Record<string, RegExp>} */
const BANNED = {
  it: /\b(sicur[oaie]|pur[oai]|pulit[oaie]|via libera|all clear)\b/i,
  en: /\b(safe|pure|clean|all clear|okay)\b/i,
};
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /\+\d[\d\s().-]{7,}\d|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/;
const LINK = /https?:\/\/|www\./i;
const SOURCE = /^(?:doi:\s*)?10\.\d{4,9}\/\S+$|^https:\/\/\S+$/i;
const MARKER = /\[f:([a-z0-9-]+)\]/g;

/** @typedef {{ key: string, params?: Record<string, string> }} Problem */

/** The lines of a text that count as one point each. @param {string} text @returns {string[]} */
export function points(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Source lines that are not a DOI or an https address. @param {string} sources @returns {string[]} */
function badSources(sources) {
  return points(sources).filter((l) => !SOURCE.test(l));
}

/**
 * Local checks of a proposal; an empty list means the link may open.
 * @param {{ section: string, lang: string, text: string, current: string, sources: string, known: Set<string> }} p
 * @returns {Problem[]}
 */
export function checkProposal(p) {
  /** @type {Problem[]} */
  const out = [];
  const text = p.text.trim();
  if (!text) return [{ key: "propose.err.empty" }];
  if (text === p.current.trim()) out.push({ key: "propose.err.unchanged" });
  if (text.length > MAX_TEXT) out.push({ key: "propose.err.too_long", params: { max: String(MAX_TEXT) } });
  const banned = (BANNED[p.lang] ?? BANNED.en).exec(text);
  if (banned) out.push({ key: "propose.err.banned", params: { word: banned[0] } });
  if (EMAIL.test(text) || PHONE.test(text) || LINK.test(text)) out.push({ key: "propose.err.contact" });
  const wrong = badSources(p.sources);
  if (wrong.length) out.push({ key: "propose.err.sources_invalid", params: { line: wrong[0] } });
  if (HEALTH.has(p.section)) {
    const hasNew = points(p.sources).some((l) => SOURCE.test(l));
    const bare = points(text).filter((l) => ![...l.matchAll(MARKER)].some((m) => p.known.has(m[1])));
    if (bare.length && !hasNew) out.push({ key: "propose.err.no_source", params: { n: String(bare.length) } });
  }
  return out;
}

/** @param {string} s @returns {string} */
const enc = (s) => encodeURIComponent(s);

/**
 * The address of the pre-filled issue. When it is longer than MAX_URL the text is left out and `pasted` is true: the caller puts the text on the clipboard.
 * @param {{ id: string, section: string, lang: string, version: number, text: string, sources: string, name: string }} p
 * @returns {{ url: string, pasted: boolean }}
 */
export function buildIssueUrl(p) {
  /** @param {boolean} withText */
  const make = (withText) => {
    /** @type {Array<[string, string]>} */
    const fields = [["substance", p.id], ["section", p.section], ["language", p.lang], ["version", String(p.version)]];
    if (withText) fields.push(["text", p.text.trim()]);
    if (p.sources.trim()) fields.push(["sources", p.sources.trim()]);
    if (p.name.trim()) fields.push(["public_name", p.name.trim()]);
    return `${GITHUB_URL}issues/new?template=${TEMPLATE}&${fields.map(([k, v]) => `${k}=${enc(v)}`).join("&")}`;
  };
  const full = make(true);
  return full.length <= MAX_URL ? { url: full, pasted: false } : { url: make(false), pasted: true };
}

/** Address of the history of a sheet on GitHub. @param {string} id @returns {string} */
export function historyUrl(id) {
  return `${GITHUB_URL}commits/main/data/substances/${enc(id)}/datasheet`;
}
