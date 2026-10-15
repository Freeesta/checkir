// @ts-check
import { el } from "./dom.js";
import { currentLang, t } from "./i18n.js";
import { buildPaneView } from "./pane_view.js";
import { paneLayout, visiblePanes } from "./panes.js";
import { kindOf } from "./tab_kinds.js";
import { gatedLink } from "./view_link.js";

/**
 * Mounts the side-by-side view in `#panes`: one box per tab of `split.panes` (a `tabpanel` named by its tab), the focused box holds `#pane-main` (moved, never rebuilt, so its ids and
 * the state of the page stay as they are), the others a light pane. The grid comes from `paneLayout`; a bar above the boxes sets the layout, the link of the x axis and ends the view.
 * @typedef {import("./state.js").AppState} AppState
 * @typedef {import("./actions.js").Ctx} Ctx
 * @typedef {{ box: HTMLElement, view: { refresh: (s: AppState) => void, destroy: () => void } | null, sig: string }} Entry
 */

/** The window width in em. @returns {number} */
function widthEm() {
  return window.innerWidth / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}

/** @param {string} label @param {string} text @param {() => void} run @returns {HTMLButtonElement} */
function barButton(label, text, run) {
  const b = /** @type {HTMLButtonElement} */ (el("button", { type: "button", class: "btn split-btn", "data-split": label }, [text]));
  b.addEventListener("click", run);
  return b;
}

/** The bar above the boxes. @param {Ctx} ctx @returns {{ node: HTMLElement, update: (s: AppState, shown: string[], names: string[]) => void }} */
function buildBar(ctx) {
  const row = barButton("row", "", () => ctx.setSplitOrientation("row"));
  const column = barButton("column", "", () => ctx.setSplitOrientation("column"));
  const group = el("div", { role: "group", class: "split-group" }, [row, column]);
  const linked = barButton("link", "", () => ctx.setSplitLinked(!ctx.getState().split.linked));
  const close = barButton("close", "", () => ctx.endSplit());
  const note = el("p", { class: "split-note", id: "split-note" });
  const node = el("div", { id: "split-bar", class: "split-bar", role: "group" }, [group, linked, close, note]);
  return {
    node,
    update(s, shown, names) {
      const layout = paneLayout(s.split.panes.length, s.split.orientation, widthEm());
      node.setAttribute("aria-label", t("tabs.split.label"));
      group.setAttribute("aria-label", t("tabs.split.layout"));
      row.textContent = t("tabs.split.row");
      column.textContent = t("tabs.split.column");
      linked.textContent = t("tabs.split.link_x");
      close.textContent = t("tabs.split.close");
      const pair = s.split.panes.length === 2 && layout.visible === 2;
      for (const [b, on] of /** @type {Array<[HTMLButtonElement, boolean]>} */ ([[row, s.split.orientation === "row"], [column, s.split.orientation === "column"]])) {
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !pair;
      }
      linked.setAttribute("aria-pressed", String(s.split.linked));
      note.textContent = layout.visible < s.split.panes.length ? t("tabs.split.showing", { codes: names.join(", "), n: String(shown.length), total: String(s.split.panes.length) }) : "";
    },
  };
}

/**
 * @param {HTMLElement} host `#panes`
 * @param {HTMLElement} main `#pane-main`, the work area of the focused tab
 * @param {Ctx} ctx
 * @param {ReturnType<typeof import("./view_link.js").createViewLink>} viewLink the x axis link shared by the main chart and the light panes
 * @returns {{ refresh: (s: AppState) => void }}
 */
export function buildPanes(host, main, ctx, viewLink) {
  const link = gatedLink(viewLink, () => ctx.getState().split.linked);
  const bar = buildBar(ctx);
  /** @type {Map<string, Entry>} */
  const entries = new Map();
  let lang = currentLang();

  /** @param {string} id */
  const drop = (id) => {
    const e = entries.get(id);
    if (!e) return;
    e.view?.destroy();
    e.box.remove();
    entries.delete(id);
  };

  const leave = () => {
    if (!host.dataset.split && !bar.node.isConnected && main.parentElement === host) return;
    for (const id of [...entries.keys()]) drop(id);
    bar.node.remove();
    host.removeAttribute("data-split");
    host.style.removeProperty("grid-template-columns");
    host.style.removeProperty("--pane-rows");
    if (main.parentElement !== host) host.append(main);
  };

  /** @param {string} id @returns {Entry} */
  const entryOf = (id) => {
    let e = entries.get(id);
    if (!e) {
      const box = el("div", { class: "split-pane", id: `panebox-${id}`, role: "tabpanel", "aria-labelledby": `tab-${id}`, "data-tab": id });
      e = { box, view: null, sig: "" };
      entries.set(id, e);
    }
    return e;
  };

  /** A light pane for a tab that is not focused. @param {Entry} e @param {import("./state.js").Tab} tab @param {AppState} s */
  const fillLight = (e, tab, s) => {
    const kind = /** @type {any} */ (kindOf(tab));
    if (typeof kind.render === "function") {
      const sig = `${currentLang()}|${tab.code}|${tab.sheet?.id ?? ""}`;
      if (e.sig !== sig || e.box.childElementCount === 0) {
        e.sig = sig;
        kind.render(e.box, tab);
      }
      return;
    }
    if (!e.view) {
      const body = el("div", { class: "pane-light" });
      e.box.replaceChildren(body);
      e.view = buildPaneView(body, tab, ctx, link);
    } else e.view.refresh(s);
  };

  /** @param {Entry} e @param {boolean} focused */
  const mark = (e, focused) => {
    e.box.toggleAttribute("data-focus", focused);
    e.box.dataset.light = focused ? "false" : "true";
  };

  /** Put the boxes in the order of the panes without touching them when they already are (moving a box would take the focus away from what is inside). @param {HTMLElement[]} order */
  const arrange = (order) => {
    if (bar.node.nextElementSibling !== host) host.before(bar.node);
    if (order.length === host.children.length && order.every((n, i) => host.children[i] === n)) return;
    host.append(...order);
  };

  const refresh = (/** @type {AppState} */ s) => {
    const ids = s.split.panes.filter((id) => s.tabs.some((x) => x.id === id));
    if (ids.length < 2 || !s.focusTab || !ids.includes(s.focusTab)) return leave();
    for (const id of [...entries.keys()]) if (!ids.includes(id)) drop(id);
    const layout = paneLayout(ids.length, s.split.orientation, widthEm());
    const shown = visiblePanes(ids, s.focusTab, layout.visible);
    if (lang !== currentLang()) {
      lang = currentLang();
      for (const e of entries.values()) e.sig = "";
    }
    const focusEntry = entryOf(s.focusTab);
    if (focusEntry.view) {
      focusEntry.view.destroy();
      focusEntry.view = null;
    }
    if (main.parentElement !== focusEntry.box) focusEntry.box.replaceChildren(main);
    for (const id of ids) {
      const e = entryOf(id);
      const tab = /** @type {import("./state.js").Tab} */ (s.tabs.find((x) => x.id === id));
      mark(e, id === s.focusTab);
      e.box.hidden = !shown.includes(id);
      e.box.style.removeProperty("grid-column");
      if (id !== s.focusTab && shown.includes(id)) fillLight(e, tab, s);
      else if (id !== s.focusTab && e.view) {
        e.view.destroy();
        e.view = null;
        e.box.replaceChildren();
      }
    }
    arrange(ids.map((id) => entryOf(id).box));
    host.dataset.split = String(ids.length);
    host.style.gridTemplateColumns = `repeat(${layout.cols}, minmax(0, 1fr))`;
    host.style.setProperty("--pane-rows", String(layout.rows));
    if (layout.cols === 2 && shown.length === 3) entryOf(shown[2]).box.style.gridColumn = "1 / -1";
    const names = shown.map((id) => kindOf(/** @type {any} */ (s.tabs.find((x) => x.id === id))).label(/** @type {any} */ (s.tabs.find((x) => x.id === id)), s).code);
    bar.update(s, shown, names);
    bar.node.hidden = false;
  };

  let width = 0;
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (host.clientWidth === width) return;
      width = host.clientWidth;
      refresh(ctx.getState());
    }).observe(host);
  }
  window.addEventListener("resize", () => refresh(ctx.getState()));
  return { refresh };
}
