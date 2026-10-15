// @ts-check
// The handle on the right edge of the side panel: drag it (mouse or touch) or use the arrow keys to change the panel width, up to a third of the window. The width is remembered as a preference.
import { el } from "./dom.js";
import { t } from "./i18n.js";
import { readPref, writePref } from "./state.js";

const MIN_PX = 192;
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;

/** Widest allowed panel: a third of the window, never below the narrowest. @returns {number} */
function maxWidth() {
  return Math.max(MIN_PX, Math.floor(window.innerWidth / 3));
}

/** @param {number} px @returns {number} */
function clampWidth(px) {
  return Math.min(maxWidth(), Math.max(MIN_PX, Math.round(px)));
}

/** @param {HTMLElement} panel @returns {number} the width on screen now */
function currentWidth(panel) {
  return Math.round(panel.getBoundingClientRect().width);
}

/**
 * Add the handle after the panel (inside the grid host) and apply the remembered width.
 * @param {HTMLElement} shell the grid that holds the panel and the work area
 * @param {HTMLElement} panel
 * @returns {{ refresh: () => void }}
 */
export function wirePanelResize(shell, panel) {
  const handle = el("div", { class: "panel-resize", role: "separator", "aria-orientation": "vertical", tabindex: "0", "data-fk": "panel-resize" });
  shell.append(handle);
  /** @param {number} px @param {boolean} save */
  const apply = (px, save) => {
    const w = clampWidth(px);
    shell.style.setProperty("--panel-w", `${w}px`);
    handle.setAttribute("aria-valuemin", String(MIN_PX));
    handle.setAttribute("aria-valuemax", String(maxWidth()));
    handle.setAttribute("aria-valuenow", String(w));
    if (save) writePref("panelWidth", String(w));
  };
  const saved = Number(readPref("panelWidth"));
  if (Number.isFinite(saved) && saved > 0) apply(saved, false);
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.setAttribute("data-drag", "");
  });
  handle.addEventListener("pointermove", (e) => {
    if (handle.hasAttribute("data-drag")) apply(e.clientX - panel.getBoundingClientRect().left, false);
  });
  const stop = () => {
    if (!handle.hasAttribute("data-drag")) return;
    handle.removeAttribute("data-drag");
    apply(currentWidth(panel), true);
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const now = currentWidth(panel);
    const next = e.key === "ArrowRight" ? now + step : e.key === "ArrowLeft" ? now - step : e.key === "Home" ? MIN_PX : e.key === "End" ? maxWidth() : null;
    if (next === null) return;
    e.preventDefault();
    apply(next, true);
  });
  window.addEventListener("resize", () => {
    if (shell.style.getPropertyValue("--panel-w")) apply(Number.parseFloat(shell.style.getPropertyValue("--panel-w")), false);
    else handle.setAttribute("aria-valuemax", String(maxWidth()));
  });
  return {
    refresh() {
      handle.setAttribute("aria-label", t("panel.resize"));
      handle.setAttribute("aria-valuenow", String(shell.style.getPropertyValue("--panel-w") ? clampWidth(Number.parseFloat(shell.style.getPropertyValue("--panel-w"))) : currentWidth(panel)));
      handle.setAttribute("aria-valuemax", String(maxWidth()));
      handle.setAttribute("aria-valuemin", String(MIN_PX));
    },
  };
}
