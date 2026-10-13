// @ts-check
import { nextStep } from "./actions.js";
import { tipText } from "./controls.js";
import { actionById } from "./actions.js";
import { el, icon, keepFocus, setIcon } from "./dom.js";
import { renderResults } from "./results.js";
import { activeFile } from "./state.js";
import { activeKey } from "./shortcuts.js";
import { attachTip } from "./tooltip.js";

/**
 * The "next step" button of the work-area bar: one main button, generated from the registry, that shows the first enabled action by `step`.
 * @param {HTMLElement} host
 * @param {import("./actions.js").Ctx} ctx
 * @returns {{ refresh: (s: import("./state.js").AppState) => void }}
 */
export function buildNextStep(host, ctx) {
  const button = el("button", { type: "button", class: "btn primary", "data-action": "file.open", "data-fk": "next-step" }, [icon("upload"), el("span", { class: "btn-label" })]);
  button.addEventListener("click", () => nextStep(ctx.getState())?.run(ctx));
  attachTip(button, () => tipText(actionById(/** @type {string} */ (button.dataset.action))));
  host.prepend(button);
  return {
    refresh(s) {
      const a = nextStep(s);
      button.hidden = !a;
      if (!a) return;
      button.dataset.action = a.id;
      const svg = button.querySelector("svg");
      if (svg) setIcon(svg, a.icon);
      const key = activeKey(a);
      if (key) button.setAttribute("aria-keyshortcuts", key);
      else button.removeAttribute("aria-keyshortcuts");
    },
  };
}

/**
 * The candidates under the chart: rebuilt on every state change, the space reserved as soon as a spectrum is shown so the arrival of the result moves nothing.
 * @param {HTMLElement} host
 * @param {import("./actions.js").Ctx} ctx
 * @returns {{ refresh: (s: import("./state.js").AppState) => void }}
 */
export function buildCandidates(host, ctx) {
  return {
    refresh(s) {
      host.toggleAttribute("data-open", activeFile(s) !== null);
      keepFocus(host, () => {
        host.replaceChildren();
        renderResults(host, s, ctx);
      });
    },
  };
}
