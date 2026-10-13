// @ts-check
import { el } from "./dom.js";
import { t } from "./i18n.js";

/**
 * The menu of the spectrum chart: right click on the chart, or the Menu key / Shift+F10 with the chart focused (the browser's own menu stays everywhere else).
 * The rows are a registry: to add one, add a line to `MENU_ITEMS`. `run` and the tests get the chart (`MenuChart`) and the page context.
 * @typedef {{
 *   hasSpectrum: () => boolean, back: () => unknown, zoomOut: () => void, showAll: () => void, resetAll: () => void, toggleLockY: () => void, isLocked: () => boolean,
 *   toggleCursors: () => void, cursorsOn: () => boolean, exportTable: () => void,
 * }} MenuChart
 * @typedef {{ id: string, labelKey: string, run: (c: MenuChart, ctx: import("./actions.js").Ctx) => void, enabled?: (c: MenuChart, ctx: import("./actions.js").Ctx) => boolean, checked?: (c: MenuChart, ctx: import("./actions.js").Ctx) => boolean }} MenuItem
 */

/** @type {MenuItem[]} */
export const MENU_ITEMS = [
  { id: "view.back", labelKey: "menu.back", run: (c) => c.back(), enabled: (c) => c.hasSpectrum() },
  { id: "view.out", labelKey: "menu.zoom_out", run: (c) => c.zoomOut(), enabled: (c) => c.hasSpectrum() },
  { id: "view.all", labelKey: "menu.show_all", run: (c) => c.showAll(), enabled: (c) => c.hasSpectrum() },
  { id: "view.reset", labelKey: "menu.reset", run: (c) => c.resetAll(), enabled: (c) => c.hasSpectrum() },
  { id: "y.lock", labelKey: "menu.lock_y", run: (c) => c.toggleLockY(), enabled: (c) => c.hasSpectrum(), checked: (c) => c.isLocked() },
  { id: "cursors", labelKey: "menu.cursors", run: (c) => c.toggleCursors(), enabled: (c) => c.hasSpectrum(), checked: (c) => c.cursorsOn() },
  { id: "table.export", labelKey: "menu.export_table", run: (c) => c.exportTable(), enabled: (c) => c.hasSpectrum() },
  { id: "library.recall", labelKey: "menu.recall", run: (_c, ctx) => ctx.recallOpen(), enabled: (_c, ctx) => ctx.getState().files.length > 0 && ctx.getState().libraries.some((l) => l.enabled) },
  { id: "inverse.open", labelKey: "menu.inverse", run: (_c, ctx) => ctx.inverseOpen(), enabled: (_c, ctx) => ctx.getState().libraries.some((l) => l.enabled) },
  { id: "peaks.toggle", labelKey: "menu.peaks", run: (_c, ctx) => ctx.togglePeaks(), enabled: (_c, ctx) => ctx.getState().files.length > 0, checked: (_c, ctx) => ctx.getState().showPeaks },
];

/** @param {number} x @param {number} y @param {HTMLElement} menu place the menu at the pointer, kept inside the window */
function place(x, y, menu) {
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height))}px`;
}

/**
 * Attach the menu to the chart host.
 * @param {HTMLElement} host
 * @param {MenuChart} chart
 * @param {import("./actions.js").Ctx} ctx
 */
export function attachMenu(host, chart, ctx) {
  /** @type {HTMLElement | null} */
  let open = null;
  const close = (/** @type {boolean} */ refocus) => {
    open?.remove();
    open = null;
    if (refocus) host.focus();
  };
  /** @param {number} x @param {number} y */
  const show = (x, y) => {
    close(false);
    const menu = el("div", { class: "chart-menu", role: "menu", "aria-label": t("menu.label") });
    const buttons = MENU_ITEMS.map((item) => {
      const checkable = item.checked !== undefined;
      const b = el("button", { type: "button", role: checkable ? "menuitemcheckbox" : "menuitem", tabindex: "-1", "data-item": item.id }, [t(item.labelKey)]);
      if (checkable) b.setAttribute("aria-checked", String(item.checked?.(chart, ctx) === true));
      b.disabled = item.enabled ? !item.enabled(chart, ctx) : false;
      b.addEventListener("click", () => {
        close(true);
        item.run(chart, ctx);
      });
      return b;
    });
    menu.append(...buttons);
    menu.addEventListener("keydown", (e) => {
      const live = buttons.filter((b) => !b.disabled);
      const at = live.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
      const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: live.length - 1 }[/** @type {string} */ (e.key)];
      if (go !== undefined) live[(go + live.length) % live.length]?.focus();
      else if (e.key === "Escape") close(true);
      else if (e.key === "Tab") return close(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    document.body.append(menu);
    place(x, y, menu);
    open = menu;
    buttons.find((b) => !b.disabled)?.focus();
  };
  host.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    show(e.clientX, e.clientY);
  });
  host.addEventListener("keydown", (e) => {
    if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
    e.preventDefault();
    const r = host.getBoundingClientRect();
    show(r.left + r.width / 2, r.top + 40);
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !open.contains(/** @type {Node} */ (e.target))) close(false);
  });
  window.addEventListener("blur", () => close(false));
}
