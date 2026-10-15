// @ts-check
import { APP_NAME, STORAGE_PREFIX } from "./appname.js";

/** Languages with a catalog in `lang/`. */
export const LANGS = ["it", "en"];
/** Each language written in itself (never translated), for the language menu. @type {Record<string, string>} */
export const LANG_NAMES = { it: "Italiano", en: "English" };
const DEFAULT_LANG = "it";

/** @type {Record<string, string>} */
let catalog = {};
let current = DEFAULT_LANG;

/** @returns {string} */
export function currentLang() {
  return current;
}

/**
 * Pick the language: stored choice, then browser language, then the default.
 * @returns {string}
 */
export function pickLang() {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + "lang");
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    // storage may be unavailable (private window): fall through
  }
  const nav = (navigator.language || "").slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : DEFAULT_LANG;
}

/**
 * Load the active catalog only (one catalog at start-up).
 * @param {string} lang
 */
export async function loadLang(lang) {
  const r = await fetch(new URL(`lang/${lang}.json`, import.meta.url));
  const next = await r.json();
  if (Object.keys(catalog).length) spare[current] = catalog;
  catalog = next;
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_PREFIX + "lang", lang);
  } catch {
    // ignored: the choice just is not remembered
  }
}

/** Catalogs of the other languages, fetched only for the counselling sheet (its language is chosen apart from the interface's). @type {Record<string, Record<string, string>>} */
const spare = {};

/** Make a second catalog available to `inLang`. @param {string} lang */
export async function preloadLang(lang) {
  if (lang === current || spare[lang] || !LANGS.includes(lang)) return;
  spare[lang] = await (await fetch(new URL(`lang/${lang}.json`, import.meta.url))).json();
}

/** Run `fn` with another language's catalog (loaded by `preloadLang`); the active language is restored at once. @template T @param {string} lang @param {() => T} fn @returns {T} */
export function inLang(lang, fn) {
  const other = spare[lang];
  if (lang === current || !other) return fn();
  const [keepCatalog, keepLang] = [catalog, current];
  [catalog, current] = [other, lang];
  try {
    return fn();
  } finally {
    [catalog, current] = [keepCatalog, keepLang];
  }
}

/**
 * Translate a key; `{name}` placeholders are replaced from `params`; `{app}` is the product name unless given. Unknown keys show the key itself.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const text = catalog[key] ?? key;
  /** @type {Record<string, string | number>} */
  const all = { app: APP_NAME, ...params };
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in all ? String(all[name]) : m));
}

/** Translate the `data-i18n*` attributes under `root`. */
export function applyCatalog(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(/** @type {string} */ (el.getAttribute("data-i18n")));
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.setAttribute("title", t(/** @type {string} */ (el.getAttribute("data-i18n-title"))));
  }
  for (const el of root.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(/** @type {string} */ (el.getAttribute("data-i18n-aria"))));
  }
}

/**
 * The only number formatter: decimal point and no thousands separator in every language.
 * @param {number} x
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatNumber(x, decimals = 0) {
  if (!Number.isFinite(x)) return "–";
  const s = x.toFixed(decimals);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

/**
 * Parse user input accepting a comma as decimal separator.
 * @param {string} text
 * @returns {number}
 */
export function parseNumber(text) {
  return Number(text.trim().replace(",", "."));
}
