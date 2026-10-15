// @ts-check
// The loading screen (markup in index.html, drawing in style.css): a photon with its red wave, no text. It is labelled for screen readers once the language is loaded and fades out when the page is ready.
import { t } from "./i18n.js";

const FADE_MS = 120;
const X_START = -40;
const X_HEAD = 292;
const Y_MID = 40;
const AMPLITUDE = 20;
const WAVELENGTH = 40;
const TRAIL = 220;
const TRAVEL_MS = 1500;
const STEP = 2;

/** Draw the photon at progress p (0 = left edge, 1 = right end): the head on the middle line and its red wave trailing behind it, so the whole figure advances to the right.
 * @param {number} p */
function drawSplash(p) {
  const wave = document.querySelector(".splash-wave");
  if (!wave) return;
  const head = X_START + p * (X_HEAD - X_START);
  const waveY = (/** @type {number} */ x) => Y_MID + AMPLITUDE * Math.sin((2 * Math.PI * (head - x)) / WAVELENGTH);
  let d = "";
  for (let x = Math.max(X_START, head - TRAIL); x < head; x += STEP) d += `${d ? "L" : "M"}${x.toFixed(1)} ${waveY(x).toFixed(2)}`;
  wave.setAttribute("d", `${d ? `${d}L` : "M"}${head.toFixed(1)} ${Y_MID}`);
  for (const el of document.querySelectorAll(".splash-head, .splash-halo")) {
    el.setAttribute("cx", head.toFixed(1));
    el.setAttribute("cy", String(Y_MID));
  }
}

/** Animate the photon from left to right, looping; still (fully drawn) with reduced motion; stops when the splash is gone. */
function startSplash() {
  drawSplash(1);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  const frame = (/** @type {number} */ now) => {
    const splash = document.getElementById("splash");
    if (!splash || splash.hasAttribute("data-gone")) return;
    drawSplash(((now - t0) % TRAVEL_MS) / TRAVEL_MS);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

startSplash();

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
