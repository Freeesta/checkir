// @ts-check
import { readPref, writePref } from "./state.js";

export const THEMES = ["auto", "light", "dark"];

/** @returns {string} */
export function currentTheme() {
  return document.documentElement.dataset.theme || "auto";
}

/** Apply a theme: `data-theme` on <html>, remembered as a preference. @param {string} mode */
export function applyTheme(mode) {
  const m = THEMES.includes(mode) ? mode : "auto";
  document.documentElement.dataset.theme = m;
  writePref("theme", m);
}

/** Set the stored theme at start-up. */
export function initTheme() {
  const saved = readPref("theme");
  document.documentElement.dataset.theme = saved && THEMES.includes(saved) ? saved : "auto";
}

/** auto → light → dark → auto. @returns {string} the new mode */
export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  applyTheme(next);
  return next;
}
