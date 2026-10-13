// @ts-check
import { nextStep } from "./actions.js";
import { tipText } from "./controls.js";
import { actionById } from "./actions.js";
import { el, icon, setIcon } from "./dom.js";
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
