// @ts-check
import { nextStep } from "./actions.js";
import { tipText } from "./controls.js";
import { actionById } from "./actions.js";
import { el, icon, setIcon } from "./dom.js";
import { t } from "./i18n.js";
import { activeKey } from "./shortcuts.js";
import { attachTip, toggletip } from "./tooltip.js";

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

/** The fixed strip of FTIR limits: always present, never collapsible; the long text sits behind the ⓘ. @param {HTMLElement} host @returns {{ refresh: () => void }} */
export function buildLimits(host) {
  const items = [() => t("limits.undetected"), () => t("limits.potent"), () => t("limits.quantity")];
  const list = el("ul", { class: "limits-list" });
  host.append(icon("limits"), list, toggletip(() => t("limits.more"), () => t("limits.more_label")));
  return {
    refresh() {
      list.replaceChildren(...items.map((k) => el("li", {}, [k()])));
      host.setAttribute("aria-label", t("limits.label"));
    },
  };
}
