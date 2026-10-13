// @ts-check
import { ACTIONS } from "./actions.js";
import { readPref, writePref } from "./state.js";

/** Keys that stay with the browser or the page and can never be given to an action. */
export const RESERVED_KEYS = ["/", "'", "Tab", "Enter", " ", "Escape", ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)];

/** @type {Set<() => void>} */
const listeners = new Set();

/** Single-key shortcuts are on unless the person switched them off (WCAG 2.1.4). @returns {boolean} */
export function shortcutsOn() {
  return readPref("shortcuts") !== "off";
}

/** @param {boolean} on */
export function setShortcutsOn(on) {
  writePref("shortcuts", on ? "on" : "off");
  for (const fn of listeners) fn();
}

/** @param {() => void} fn called when the switch changes @returns {() => void} unsubscribe */
export function onShortcutsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The key to announce and show for an action, or undefined when it has none or shortcuts are off. @param {import("./actions.js").Action} a @returns {string | undefined} */
export function activeKey(a) {
  return shortcutsOn() ? a.key : undefined;
}

/** @param {EventTarget | null} target @returns {boolean} */
function inField(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

/** The action a key event stands for, or null when the event must be left alone. @param {KeyboardEvent} e @returns {import("./actions.js").Action | null} */
export function actionForEvent(e) {
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return null;
  // AltGr (Ctrl+Alt on Windows) types characters such as "[" on Italian keyboards: it is not a shortcut modifier.
  const altGr = typeof e.getModifierState === "function" && e.getModifierState("AltGr");
  if (!altGr && (e.ctrlKey || e.altKey || e.metaKey)) return null;
  if (inField(e.target) || document.querySelector("dialog[open]")) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return ACTIONS.find((a) => a.key === key) ?? null;
}

/**
 * One keydown listener on the document: it runs the action of a single-key shortcut. Components that handle a key themselves
 * (the chart's + - arrows 0) call preventDefault first and are left alone.
 * @param {import("./actions.js").Ctx} ctx
 */
export function attachShortcuts(ctx) {
  document.addEventListener("keydown", (e) => {
    if (!shortcutsOn()) return;
    const a = actionForEvent(e);
    if (!a || !a.enabled(ctx.getState())) return;
    e.preventDefault();
    a.run(ctx);
  });
}
