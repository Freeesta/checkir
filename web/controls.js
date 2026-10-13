// @ts-check
import { actionById } from "./actions.js";
import { el, icon, setIcon } from "./dom.js";
import { t } from "./i18n.js";
import { currentTheme } from "./theme.js";
import { themeIcon } from "./actions.js";
import { attachTip } from "./tooltip.js";

/** @param {import("./actions.js").Action} a @returns {string} */
export function tipText(a) {
  return a.key ? `${t(a.tipKey)} (${a.key})` : t(a.tipKey);
}

/** @param {import("./actions.js").Action} a @returns {string} */
export function actionLabel(a) {
  return a.id === "theme.cycle" ? `${t(a.labelKey)}: ${t(`theme.${currentTheme()}`)}` : t(a.labelKey);
}

/**
 * Button generated from the registry. `withLabel` shows the action's name next to the icon; without it the name is only the accessible name.
 * @param {string} actionId
 * @param {import("./actions.js").Ctx} ctx
 * @param {{ withLabel?: boolean, className?: string }} [opts]
 * @returns {HTMLButtonElement}
 */
export function actionButton(actionId, ctx, opts = {}) {
  const a = actionById(actionId);
  const button = el("button", { type: "button", class: opts.className ?? "icon-button", "data-action": a.id, "data-fk": a.id });
  button.append(icon(a.icon));
  if (opts.withLabel) button.append(el("span", { class: "btn-label" }));
  if (a.key) button.setAttribute("aria-keyshortcuts", a.key);
  button.addEventListener("click", () => a.run(ctx));
  attachTip(button, () => tipText(a));
  return button;
}

/** Update names, tooltips' source and enabled state of every generated button (after a language or state change). @param {import("./state.js").AppState} state */
export function refreshActionButtons(state) {
  for (const b of document.querySelectorAll("button[data-action]")) {
    const button = /** @type {HTMLButtonElement} */ (b);
    const a = actionById(/** @type {string} */ (button.dataset.action));
    const name = actionLabel(a);
    button.setAttribute("aria-label", name);
    const label = button.querySelector(".btn-label");
    if (label) label.textContent = t(a.labelKey);
    button.disabled = !a.enabled(state);
    if (a.id === "theme.cycle") {
      const svg = button.querySelector("svg");
      if (svg) setIcon(svg, themeIcon(currentTheme()));
    }
  }
}
