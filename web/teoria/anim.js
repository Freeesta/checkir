// @ts-check
// Animation of the interactive figures: never starts by itself when the person asks for reduced motion, always has Pause / Start.
import { el } from "../dom.js";
import { t } from "../i18n.js";

/** @returns {boolean} true when animation is allowed */
export function motionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A loop that calls `draw(phase)` with phase in [0, 1) once per frame while it runs.
 * @param {(phase: number) => void} draw
 * @param {number} periodMs duration of one cycle
 * @returns {{ start: () => void, stop: () => void, running: () => boolean, set: (phase: number) => void }}
 */
export function createLoop(draw, periodMs) {
  let handle = 0;
  let phase = 0;
  let last = 0;
  /** @param {number} now */
  const tick = (now) => {
    phase = (phase + Math.max(0, now - last) / periodMs) % 1; // the first frame can carry an earlier time stamp
    last = now;
    draw(phase);
    handle = requestAnimationFrame(tick);
  };
  return {
    start() {
      if (handle) return;
      last = performance.now();
      handle = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(handle);
      handle = 0;
    },
    running: () => handle !== 0,
    set(p) {
      phase = ((p % 1) + 1) % 1;
      draw(phase);
    },
  };
}

/**
 * The Pause / Start button (WCAG 2.2.2) bound to a loop; absent when motion is not allowed.
 * @param {ReturnType<typeof createLoop>} loop
 * @returns {{ button: HTMLButtonElement, refresh: () => void }}
 */
export function playButton(loop) {
  const button = el("button", { type: "button", class: "btn" });
  const refresh = () => {
    button.textContent = loop.running() ? t("teoria.anim.pause") : t("teoria.anim.start");
    button.setAttribute("aria-pressed", String(loop.running()));
  };
  button.addEventListener("click", () => {
    if (loop.running()) loop.stop();
    else loop.start();
    refresh();
  });
  refresh();
  return { button, refresh };
}
