// @ts-check
import { ACTIONS } from "./actions.js";
import { isMenuKey, openMenu } from "./context_menu.js";
import { t } from "./i18n.js";
import { activeKey } from "./shortcuts.js";

/**
 * The menu of the spectrum chart: right click on the chart, or the Menu key / Shift+F10 with the chart focused (the browser's own menu stays everywhere else).
 * The rows are a registry: to add one, add a line to `MENU_ITEMS`. `run` and the tests get the chart (`MenuChart`) and the page context.
 * @typedef {{
 *   hasSpectrum: () => boolean, cursorAt: (i: number, wn: number) => void, wnAt: (e: MouseEvent) => number | null, zoomOut: () => void, showAll: () => void, resetAll: () => void, toggleLockY: () => void, isLocked: () => boolean,
 *   toggleCursors: () => void, cursorsOn: () => boolean,
 * }} MenuChart
 * @typedef {{ id: string, labelKey: string, run: (c: MenuChart, ctx: import("./actions.js").Ctx, at: number | null) => void, enabled?: (c: MenuChart, ctx: import("./actions.js").Ctx, at: number | null) => boolean, checked?: (c: MenuChart, ctx: import("./actions.js").Ctx, at: number | null) => boolean }} MenuItem
 */

/** The commands of the chart itself; everything else in the menu comes from the registry of actions (`menu: true`), with its key on the right. @type {MenuItem[]} */
export const MENU_ITEMS = [
  { id: "view.out", labelKey: "menu.zoom_out", run: (c) => c.zoomOut(), enabled: (c) => c.hasSpectrum() },
  { id: "view.all", labelKey: "menu.show_all", run: (c) => c.showAll(), enabled: (c) => c.hasSpectrum() },
  { id: "view.reset", labelKey: "menu.reset", run: (c) => c.resetAll(), enabled: (c) => c.hasSpectrum() },
  { id: "y.lock", labelKey: "menu.lock_y", run: (c) => c.toggleLockY(), enabled: (c) => c.hasSpectrum(), checked: (c) => c.isLocked() },
  { id: "cursors", labelKey: "menu.cursors", run: (c) => c.toggleCursors(), enabled: (c) => c.hasSpectrum(), checked: (c) => c.cursorsOn() },
  { id: "cursor.1", labelKey: "menu.cursor_1", run: (c, _x, at) => at !== null && c.cursorAt(0, at), enabled: (c, _x, at) => c.hasSpectrum() && at !== null },
  { id: "cursor.2", labelKey: "menu.cursor_2", run: (c, _x, at) => at !== null && c.cursorAt(1, at), enabled: (c, _x, at) => c.hasSpectrum() && at !== null },
];

/**
 * Attach the menu to the chart host.
 * @param {HTMLElement} host
 * @param {MenuChart} chart
 * @param {import("./actions.js").Ctx} ctx
 * @param {boolean} [withActions] the actions of the page too (false for the chart of a pane that is not focused: they would act on the focused tab)
 */
export function attachMenu(host, chart, ctx, withActions = true) {
  /** @param {number} x @param {number} y @param {number | null} at wavenumber under the pointer, if any */
  const show = (x, y, at) => {
    const state = ctx.getState();
    openMenu({
      x,
      y,
      label: t("menu.label"),
      returnFocus: host,
      rows: [
        ...MENU_ITEMS.map((i) => ({ id: i.id, label: t(i.labelKey), checked: i.checked?.(chart, ctx, at), disabled: i.enabled ? !i.enabled(chart, ctx, at) : false, run: () => i.run(chart, ctx, at) })),
        ...(withActions ? ACTIONS : []).filter((a) => a.menu).map((a) => ({ id: a.id, label: t(a.labelKey), key: activeKey(a), checked: a.id === "peaks.toggle" ? state.showPeaks : undefined, disabled: !a.enabled(state), run: () => a.run(ctx) })),
      ],
    });
  };
  host.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    show(e.clientX, e.clientY, chart.wnAt(e));
  });
  host.addEventListener("keydown", (e) => {
    if (!isMenuKey(e)) return;
    e.preventDefault();
    const r = host.getBoundingClientRect();
    show(r.left + r.width / 2, r.top + 40, null);
  });
}
