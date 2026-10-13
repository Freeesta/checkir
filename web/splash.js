// @ts-check
// The loading screen (markup in index.html, drawing in style.css): a photon with its red wave, no text. It is labelled for screen readers once the language is loaded and fades out when the page is ready.
import { t } from "./i18n.js";

const FADE_MS = 120;

/** Put the translated "Loading" in the status region (hidden text). */
export function labelSplash() {
  const label = document.getElementById("splash-label");
  if (label) label.textContent = t("splash.loading");
}

/** Fade the loading screen out (at most 150 ms), then remove it; it stops catching clicks at once. */
export function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.setAttribute("data-gone", "");
  setTimeout(() => splash.remove(), FADE_MS + 20);
}
