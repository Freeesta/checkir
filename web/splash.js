// @ts-check
// The loading screen (markup in index.html, drawing in style.css): a photon with its red wave, no text. It is labelled for screen readers once the language is loaded and fades out when the page is ready.
import { t } from "./i18n.js";

const FADE_MS = 120;
const X_START = -40;
const X_HEAD = 292;
const Y_MID = 40;
const AMPLITUDE = 20;
const WAVELENGTH = 40;
const PERIOD_MS = 900;
const STEP = 2;

/** Wave height at x and time t (ms): a sine travelling right, one wavelength per period.
 * @param {number} x
 * @param {number} t */
function waveY(x, t) {
  return Y_MID - AMPLITUDE * Math.sin((2 * Math.PI * (x - (WAVELENGTH * t) / PERIOD_MS)) / WAVELENGTH);
}

/** Draw the wave as a polyline that ends exactly in the head, and put the head (and its halo) on that last point.
 * @param {number} t */
function drawSplash(t) {
  const wave = document.querySelector(".splash-wave");
  if (!wave) return;
  let d = "";
  for (let x = X_START; x < X_HEAD; x += STEP) d += `${d ? "L" : "M"}${x} ${waveY(x, t).toFixed(2)}`;
  const y = waveY(X_HEAD, t).toFixed(2);
  wave.setAttribute("d", `${d}L${X_HEAD} ${y}`);
  for (const el of document.querySelectorAll(".splash-head, .splash-halo")) el.setAttribute("cy", y);
}

/** Animate wave and head from the same phase; static with reduced motion; stops when the splash is gone. */
function startSplash() {
  drawSplash(0);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  const frame = (/** @type {number} */ now) => {
    const splash = document.getElementById("splash");
    if (!splash || splash.hasAttribute("data-gone")) return;
    drawSplash(now - t0);
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
