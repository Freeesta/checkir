// @ts-check
import { el } from "./dom.js";

/**
 * One context menu on the page at a time: the chart's and the one of the rows (candidates, peaks, regions) share this. Arrow keys, Home, End and Esc work;
 * a click outside, Tab or leaving the window closes it. Rows are plain data, so each caller builds them from its own registry.
 * @typedef {{ id: string, label: string, key?: string, checked?: boolean, disabled: boolean, run: () => void }} MenuRow
 */

/** @type {(() => void) | null} */
let closeOpen = null;

/** @param {number} x @param {number} y @param {HTMLElement} menu place the menu at the pointer, kept inside the window */
function place(x, y, menu) {
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height))}px`;
}

/** @param {MenuRow} r @param {(refocus: boolean) => void} close @returns {HTMLButtonElement} */
function rowButton(r, close) {
  const checkable = r.checked !== undefined;
  const b = /** @type {HTMLButtonElement} */ (el("button", { type: "button", role: checkable ? "menuitemcheckbox" : "menuitem", tabindex: "-1", "data-item": r.id }, [el("span", {}, [r.label]), el("span", { class: "menu-key" }, [r.key ?? ""])]));
  if (checkable) b.setAttribute("aria-checked", String(r.checked === true));
  b.disabled = r.disabled;
  b.addEventListener("click", () => {
    close(true);
    r.run();
  });
  return b;
}

/**
 * Show a menu at a point of the window.
 * @param {{ x: number, y: number, label: string, rows: MenuRow[], returnFocus: HTMLElement | null }} o `returnFocus` gets the focus back when the menu closes by a choice or Esc
 */
export function openMenu(o) {
  closeOpen?.();
  const menu = el("div", { class: "chart-menu", role: "menu", "aria-label": o.label });
  const close = (/** @type {boolean} */ refocus) => {
    menu.remove();
    document.removeEventListener("pointerdown", outside);
    window.removeEventListener("blur", away);
    closeOpen = null;
    if (refocus) o.returnFocus?.focus();
  };
  const outside = (/** @type {Event} */ e) => {
    if (!menu.contains(/** @type {Node} */ (e.target))) close(false);
  };
  const away = () => close(false);
  const buttons = o.rows.map((r) => rowButton(r, close));
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
  place(o.x, o.y, menu);
  document.addEventListener("pointerdown", outside);
  window.addEventListener("blur", away);
  closeOpen = () => close(false);
  buttons.find((b) => !b.disabled)?.focus();
}

/** Where a menu opened from the keyboard goes: the left edge of the element, a little below its top. @param {Element} target @returns {{ x: number, y: number }} */
export function anchorOf(target) {
  const r = target.getBoundingClientRect();
  return { x: r.left + Math.min(40, r.width / 2), y: r.top + Math.min(24, r.height / 2) };
}

/** @param {KeyboardEvent} e @returns {boolean} the key that opens a context menu from the keyboard */
export const isMenuKey = (e) => e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
