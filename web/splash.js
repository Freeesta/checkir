// @ts-check
// The loading screen (markup in index.html, drawing in style.css): a photon whose red wave travels to the right, no text. It is labelled for screen readers once the language is loaded and fades out when the page is ready.
import { t } from "./i18n.js";

const FADE_MS = 120;
const X_FROM = 20;
const X_TO = 300;
const X_HEAD = 292;
const Y_MID = 40;
const AMPLITUDE = 20;
const WAVELENGTH = 40;
const PERIOD_MS = 1200;
const STEP = 2;

/** Draw the red wave at phase `phase` (radians): y = sin(k x - phase), so every crest moves to the right as the phase grows (one wavelength per period, far below the frame step, so no wheel effect). The photon head stays at the right end.
 * @param {number} phase */
function drawSplash(phase) {
  const wave = document.querySelector(".splash-wave");
  if (!wave) return;
  let d = "";
  for (let x = X_FROM; x <= X_TO; x += STEP) d += `${d ? "L" : "M"}${x} ${(Y_MID - AMPLITUDE * Math.sin((2 * Math.PI * x) / WAVELENGTH - phase)).toFixed(2)}`;
  wave.setAttribute("d", d);
  for (const el of document.querySelectorAll(".splash-head, .splash-halo")) {
    el.setAttribute("cx", String(X_HEAD));
    el.setAttribute("cy", String(Y_MID));
  }
}

/** Propagate the wave to the right, looping seamlessly; still (phase 0) with reduced motion; stops when the splash is gone. */
function startSplash() {
  drawSplash(0);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  const frame = (/** @type {number} */ now) => {
    const splash = document.getElementById("splash");
    if (!splash || splash.hasAttribute("data-gone")) return;
    drawSplash((2 * Math.PI * ((now - t0) % PERIOD_MS)) / PERIOD_MS);
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
