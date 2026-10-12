// @ts-check
import { STORAGE_PREFIX } from "./appname.js";

/** Languages with a catalog in `lang/`. */
export const LANGS = ["it", "en"];
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
  catalog = await r.json();
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_PREFIX + "lang", lang);
  } catch {
    // ignored: the choice just is not remembered
  }
}

/**
 * Translate a key; `{name}` placeholders are replaced from `params`. Unknown keys show the key itself.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const text = catalog[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
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
