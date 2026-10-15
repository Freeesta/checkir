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

/** @param {HTMLElement} host @param {Ctx} ctx @returns {{ refresh: (s: AppState) => void }} */
export function buildTabs(host, ctx) {
  const list = el("div", { role: "tablist", class: "doc-tablist" });
  const scroll = el("div", { class: "doc-tabs-scroll" }, [list]);
  const all = el("button", { type: "button", id: "tabs-list", class: "tabs-list", "aria-haspopup": "menu" });
  const notice = el("p", { id: "tabs-notice", class: "tabs-notice" });
  host.append(el("div", { class: "doc-tabs-bar" }, [scroll, all]), notice);
  const pane = document.getElementById("pane-main");
  let sig = "";
  let shownFocus = /** @type {string | null} */ (null);
  let roving = /** @type {string | null} */ (null);
  let state = /** @type {AppState | null} */ (null);

  /** Scroll the bar just enough to show a tab (`scrollIntoView` would move the starting point of the Tab key). @param {HTMLElement | null} b */
  const reveal = (b) => {
    if (!b) return;
    const from = b.offsetLeft - list.offsetLeft;
    if (from < scroll.scrollLeft) scroll.scrollLeft = from;
    else if (from + b.offsetWidth > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = from + b.offsetWidth - scroll.clientWidth;
  };
  /** @param {string | null} id */
  const button = (id) => /** @type {HTMLButtonElement | null} */ (id ? list.querySelector(`[data-tab="${id}"]`) : null);
  /** @param {string | null} id move the focus to the tab and make it the one the Tab key reaches */
  const rove = (id) => {
    roving = id;
    for (const b of list.querySelectorAll("button")) b.tabIndex = b.dataset.tab === id ? 0 : -1;
    button(id)?.focus();
  };
  /** @param {Tab} tab @param {AppState} s */
  const rowsOf = (tab, s) => menuRows(tab, s, ctx).map((r) => ({ ...r, run: () => { pending = tab.id; r.run(); } }));
  let pending = /** @type {string | null} */ (null);
  /** @param {Tab} tab @param {number} x @param {number} y */
  const showMenu = (tab, x, y) => state && openMenu({ x, y, label: labelOf(tab, state).text, rows: rowsOf(tab, state), returnFocus: button(tab.id) });

  /** @param {Tab} tab @param {AppState} s @returns {HTMLButtonElement} */
  function tabButton(tab, s) {
    const { code, name, text } = labelOf(tab, s);
    const on = tab.id === s.focusTab;
    const b = /** @type {HTMLButtonElement} */ (el("button", { type: "button", role: "tab", id: `tab-${tab.id}`, class: "doc-tab", "data-tab": tab.id, "data-fk": `tab-${tab.id}`, "data-kind": tab.kind, "aria-selected": String(on), "aria-controls": kindOf(tab).panel, "aria-label": text, "aria-keyshortcuts": "Delete", tabindex: tab.id === roving ? "0" : "-1" }));
    if (name) b.title = name;
    b.append(icon(kindOf(tab).icon), el("span", { class: "tab-code" }, [code]), el("span", { class: "tab-name" }, [name]), el("span", { class: "tab-close", "aria-hidden": "true" }, ["×"]));
    return b;
  }

  list.addEventListener("click", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button");
    if (!b?.dataset.tab) return;
    if (/** @type {HTMLElement} */ (e.target).closest(".tab-close")) ctx.closeTab(b.dataset.tab);
    else ctx.focusTab(b.dataset.tab);
  });
  list.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  list.addEventListener("auxclick", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button");
    if (e.button === 1 && b?.dataset.tab) {
      e.preventDefault();
      ctx.closeTab(b.dataset.tab);
    }
  });
  list.addEventListener("contextmenu", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button");
    const tab = state?.tabs.find((x) => x.id === b?.dataset.tab);
    if (!tab) return;
    e.preventDefault();
    showMenu(tab, e.clientX, e.clientY);
  });
  list.addEventListener("keydown", (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest("button");
    const id = b?.dataset.tab;
    const tabs = state?.tabs ?? [];
    const at = tabs.findIndex((x) => x.id === id);
    if (!id || at < 0) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step && e.ctrlKey && e.shiftKey) {
      pending = id;
      ctx.moveTab(id, at + step);
    } else if (step && !e.ctrlKey && !e.altKey) rove(tabs[(at + step + tabs.length) % tabs.length].id);
    else if (e.key === "Home") rove(tabs[0].id);
    else if (e.key === "End") rove(tabs[tabs.length - 1].id);
    else if (e.key === "Delete") {
      pending = id;
      ctx.closeTab(id);
    }
    else if (isMenuKey(e)) {
      const p = anchorOf(/** @type {HTMLElement} */ (b));
      showMenu(tabs[at], p.x, p.y);
    } else return;
    e.preventDefault();
  });
  all.addEventListener("click", () => {
    if (!state) return;
    const s = state;
    const p = anchorOf(all);
    openMenu({ x: p.x, y: p.y + all.offsetHeight, label: t("tabs.list"), returnFocus: all, rows: s.tabs.map((tab) => ({ id: `tab.show.${tab.id}`, label: labelOf(tab, s).text, checked: tab.id === s.focusTab, disabled: false, run: () => { pending = tab.id; ctx.focusTab(tab.id); } })) });
  });

  return {
    refresh(s) {
      state = s;
      host.hidden = s.tabs.length === 0;
      const next = JSON.stringify([currentLang(), s.focusTab, s.tabs.map((x) => [x.id, x.kind, labelOf(x, s).name])]);
      if (next !== sig) {
        sig = next;
        if (!s.tabs.some((x) => x.id === roving) || shownFocus !== s.focusTab) roving = s.focusTab;
        keepFocus(list, () => list.replaceChildren(...s.tabs.map((x) => tabButton(x, s))));
        all.replaceChildren(el("span", { "aria-hidden": "true" }, ["▾ "]), el("span", { class: "tabs-count" }, [String(s.tabs.length)]));
        all.setAttribute("aria-label", t("tabs.list"));
        list.setAttribute("aria-label", t("tabs.label"));
        if (shownFocus !== s.focusTab) reveal(button(s.focusTab));
        shownFocus = s.focusTab;
      }
      if (pending) {
        rove(button(pending) ? pending : s.focusTab);
        pending = null;
      }
      if (pane) {
        if (s.focusTab) {
          pane.setAttribute("role", "tabpanel");
          pane.setAttribute("aria-labelledby", `tab-${s.focusTab}`);
        } else {
          pane.removeAttribute("role");
          pane.removeAttribute("aria-labelledby");
        }
      }
      const text = s.tabNotice ? t(s.tabNotice.key, s.tabNotice.params) : "";
      if (notice.textContent !== text) notice.textContent = text;
    },
  };
}
