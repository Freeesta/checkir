// @ts-check
import { anchorOf, isMenuKey, openMenu } from "./context_menu.js";
import { el, icon, keepFocus } from "./dom.js";
import { currentLang, t } from "./i18n.js";
import { kindOf } from "./tab_kinds.js";

/**
 * The bar of open tabs above the work area (`#doc-tabs`): a `tablist` with manual activation (arrows move the focus, Enter or Space shows the tab), the list of all tabs
 * and the notice of a refused opening. Built from the state, rebuilt only when what it shows changes.
 * @typedef {import("./state.js").Tab} Tab
 * @typedef {import("./state.js").AppState} AppState
 * @typedef {import("./actions.js").Ctx} Ctx
 */

/** @param {Tab} tab @param {AppState} s @returns {{ code: string, name: string, text: string }} */
function labelOf(tab, s) {
  const { code, name } = kindOf(tab).label(tab, s);
  return { code, name, text: t(kindOf(tab).nameKey, { code, name }).trim() };
}

/** The rows of the context menu of a tab; the side-by-side view adds its own later. @param {Tab} tab @param {AppState} s @param {Ctx} ctx @returns {import("./context_menu.js").MenuRow[]} */
export function menuRows(tab, s, ctx) {
  const at = s.tabs.findIndex((x) => x.id === tab.id);
  return [
    { id: "tab.move_left", label: t("tabs.move_left"), disabled: at <= 0, run: () => ctx.moveTab(tab.id, at - 1) },
    { id: "tab.move_right", label: t("tabs.move_right"), disabled: at < 0 || at >= s.tabs.length - 1, run: () => ctx.moveTab(tab.id, at + 1) },
    { id: "tab.close", label: t("tabs.close"), key: "Del", disabled: false, run: () => ctx.closeTab(tab.id) },
    { id: "tab.close_others", label: t("tabs.close_others"), disabled: s.tabs.length < 2, run: () => ctx.closeOtherTabs(tab.id) },
  ];
}

/**
 * What the bar remembers between redraws: the last state, the tab the Tab key reaches, and the tab that must get the focus after the next redraw (`"@"`-less: an id; if it is gone, the focused tab).
 * @typedef {{ state: AppState | null, roving: string | null, pending: string | null, shownFocus: string | null, sig: string }} Bar
 */

/** @param {HTMLElement} list @param {string | null} id @returns {HTMLButtonElement | null} */
function buttonOf(list, id) {
  return /** @type {HTMLButtonElement | null} */ (id ? list.querySelector(`[data-tab="${id}"]`) : null);
}

/** Make a tab the one the Tab key reaches and give it the focus. @param {HTMLElement} list @param {Bar} bar @param {string | null} id */
function rove(list, bar, id) {
  bar.roving = id;
  for (const b of list.querySelectorAll("button")) b.tabIndex = b.dataset.tab === id ? 0 : -1;
  buttonOf(list, id)?.focus();
}

/** Scroll the bar just enough to show a tab (`scrollIntoView` would move the starting point of the Tab key). @param {HTMLElement} scroll @param {HTMLElement} list @param {HTMLElement | null} b */
function reveal(scroll, list, b) {
  if (!b) return;
  const from = b.offsetLeft - list.offsetLeft;
  if (from < scroll.scrollLeft) scroll.scrollLeft = from;
  else if (from + b.offsetWidth > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = from + b.offsetWidth - scroll.clientWidth;
}

/** @param {Tab} tab @param {AppState} s @param {string | null} roving @returns {HTMLButtonElement} */
function tabButton(tab, s, roving) {
  const { code, name, text } = labelOf(tab, s);
  const on = tab.id === s.focusTab;
  const b = /** @type {HTMLButtonElement} */ (el("button", { type: "button", role: "tab", id: `tab-${tab.id}`, class: "doc-tab", "data-tab": tab.id, "data-fk": `tab-${tab.id}`, "data-kind": tab.kind, "aria-selected": String(on), "aria-controls": kindOf(tab).panel, "aria-label": text, "aria-keyshortcuts": "Delete", tabindex: tab.id === roving ? "0" : "-1" }));
  if (name) b.title = name;
  b.append(icon(kindOf(tab).icon), el("span", { class: "tab-code" }, [code]), el("span", { class: "tab-name" }, [name]), el("span", { class: "tab-close", "aria-hidden": "true" }, ["×"]));
  return b;
}

/** The context menu of a tab; the action that follows hands the focus back to the bar. @param {HTMLElement} list @param {Ctx} ctx @param {Bar} bar @param {Tab} tab @param {number} x @param {number} y */
function showMenu(list, ctx, bar, tab, x, y) {
  const s = bar.state;
  if (!s) return;
  const rows = menuRows(tab, s, ctx).map((r) => ({ ...r, run: () => { bar.pending = tab.id; r.run(); } }));
  openMenu({ x, y, label: labelOf(tab, s).text, rows, returnFocus: buttonOf(list, tab.id) });
}

/** Mouse: click, X, middle click, right click. @param {HTMLElement} list @param {Ctx} ctx @param {Bar} bar */
function wireMouse(list, ctx, bar) {
  /** @param {Event} e @returns {HTMLElement | null} */
  const tabOf = (e) => /** @type {HTMLElement} */ (e.target).closest("button");
  list.addEventListener("click", (e) => {
    const id = tabOf(e)?.dataset.tab;
    if (!id) return;
    if (/** @type {HTMLElement} */ (e.target).closest(".tab-close")) ctx.closeTab(id);
    else ctx.focusTab(id);
  });
  list.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  list.addEventListener("auxclick", (e) => {
    const id = tabOf(e)?.dataset.tab;
    if (e.button === 1 && id) {
      e.preventDefault();
      ctx.closeTab(id);
    }
  });
  list.addEventListener("contextmenu", (e) => {
    const tab = bar.state?.tabs.find((x) => x.id === tabOf(e)?.dataset.tab);
    if (!tab) return;
    e.preventDefault();
    showMenu(list, ctx, bar, tab, e.clientX, e.clientY);
  });
}

/** Keyboard: arrows, Home, End, Delete, Ctrl+Shift+arrows, the menu key. Enter and Space act as a click. @param {HTMLElement} list @param {Ctx} ctx @param {Bar} bar */
function wireKeys(list, ctx, bar) {
  list.addEventListener("keydown", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button");
    const id = b?.dataset.tab;
    const tabs = bar.state?.tabs ?? [];
    const at = tabs.findIndex((x) => x.id === id);
    if (!id || at < 0) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step && e.ctrlKey && e.shiftKey) {
      bar.pending = id;
      ctx.moveTab(id, at + step);
    } else if (step && !e.ctrlKey && !e.altKey) rove(list, bar, tabs[(at + step + tabs.length) % tabs.length].id);
    else if (e.key === "Home") rove(list, bar, tabs[0].id);
    else if (e.key === "End") rove(list, bar, tabs[tabs.length - 1].id);
    else if (e.key === "Delete") {
      bar.pending = id;
      ctx.closeTab(id);
    } else if (isMenuKey(e)) {
      const p = anchorOf(/** @type {HTMLElement} */ (b));
      showMenu(list, ctx, bar, tabs[at], p.x, p.y);
    } else return;
    e.preventDefault();
  });
}

/** The list of all tabs under the ▾ button. @param {HTMLElement} all @param {Ctx} ctx @param {Bar} bar */
function wireAll(all, ctx, bar) {
  all.addEventListener("click", () => {
    const s = bar.state;
    if (!s) return;
    const p = anchorOf(all);
    const rows = s.tabs.map((tab) => ({ id: `tab.show.${tab.id}`, label: labelOf(tab, s).text, checked: tab.id === s.focusTab, disabled: false, run: () => { bar.pending = tab.id; ctx.focusTab(tab.id); } }));
    openMenu({ x: p.x, y: p.y + all.offsetHeight, label: t("tabs.list"), returnFocus: all, rows });
  });
}

/** @param {HTMLElement | null} pane @param {string | null} focus the tab panel is named by the focused tab */
function labelPane(pane, focus) {
  if (!pane) return;
  if (focus) {
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", `tab-${focus}`);
  } else {
    pane.removeAttribute("role");
    pane.removeAttribute("aria-labelledby");
  }
}

/** @param {HTMLElement} host @param {Ctx} ctx @returns {{ refresh: (s: AppState) => void }} */
export function buildTabs(host, ctx) {
  const list = el("div", { role: "tablist", class: "doc-tablist" });
  const scroll = el("div", { class: "doc-tabs-scroll" }, [list]);
  const all = el("button", { type: "button", id: "tabs-list", class: "tabs-list", "aria-haspopup": "menu" });
  const notice = el("p", { id: "tabs-notice", class: "tabs-notice" });
  host.append(el("div", { class: "doc-tabs-bar" }, [scroll, all]), notice);
  /** @type {Bar} */
  const bar = { state: null, roving: null, pending: null, shownFocus: null, sig: "" };
  wireMouse(list, ctx, bar);
  wireKeys(list, ctx, bar);
  wireAll(all, ctx, bar);

  /** @param {AppState} s */
  const redraw = (s) => {
    if (!s.tabs.some((x) => x.id === bar.roving) || bar.shownFocus !== s.focusTab) bar.roving = s.focusTab;
    keepFocus(list, () => list.replaceChildren(...s.tabs.map((x) => tabButton(x, s, bar.roving))));
    all.replaceChildren(el("span", { "aria-hidden": "true" }, ["▾ "]), el("span", { class: "tabs-count" }, [String(s.tabs.length)]));
    all.setAttribute("aria-label", t("tabs.list"));
    list.setAttribute("aria-label", t("tabs.label"));
    if (bar.shownFocus !== s.focusTab) reveal(scroll, list, buttonOf(list, s.focusTab));
    bar.shownFocus = s.focusTab;
  };

  return {
    refresh(s) {
      bar.state = s;
      host.hidden = s.tabs.length === 0;
      const next = JSON.stringify([currentLang(), s.focusTab, s.tabs.map((x) => [x.id, x.kind, labelOf(x, s).name])]);
      if (next !== bar.sig) {
        bar.sig = next;
        redraw(s);
      }
      if (bar.pending) {
        rove(list, bar, buttonOf(list, bar.pending) ? bar.pending : s.focusTab);
        bar.pending = null;
      }
      labelPane(document.getElementById("pane-main"), s.focusTab);
      const text = s.tabNotice ? t(s.tabNotice.key, s.tabNotice.params) : "";
      if (notice.textContent !== text) notice.textContent = text;
    },
  };
}
