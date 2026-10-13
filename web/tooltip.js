// @ts-check
import { icon } from "./dom.js";

const HIDE_DELAY_MS = 150;
/** @type {HTMLElement | null} */
let bubble = null;
/** @type {HTMLElement | null} */
let owner = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/** @returns {HTMLElement} */
function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement("div");
  bubble.id = "tooltip";
  bubble.className = "tooltip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  // WCAG 1.4.13: the pointer may move onto the tooltip without it disappearing.
  bubble.addEventListener("mouseenter", () => clearTimeout(timer));
  bubble.addEventListener("mouseleave", () => scheduleHide());
  document.body.append(bubble);
  document.addEventListener("keydown", (e) => {
    // Only hide it: the key still reaches a dialog or the chart, so one Esc is never swallowed by a tooltip.
    if (e.key === "Escape" && bubble && !bubble.hidden) hide();
  });
  return bubble;
}

/** Hide the tooltip now. */
export function hide() {
  clearTimeout(timer);
  if (!bubble) return;
  bubble.hidden = true;
  owner?.removeAttribute("aria-describedby");
  owner = null;
}

/** Hide the tooltip if the element it belongs to was rebuilt and no longer exists. */
export function hideIfDetached() {
  if (owner && !owner.isConnected) hide();
}

function scheduleHide() {
  clearTimeout(timer);
  timer = setTimeout(hide, HIDE_DELAY_MS);
}

/** @param {HTMLElement} host @param {() => string} text */
function show(host, text) {
  clearTimeout(timer);
  const b = ensureBubble();
  if (owner && owner !== host) owner.removeAttribute("aria-describedby");
  owner = host;
  b.textContent = text();
  b.hidden = false;
  host.setAttribute("aria-describedby", b.id);
  const r = host.getBoundingClientRect();
  const w = b.offsetWidth;
  const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), document.documentElement.clientWidth - w - 4);
  const below = r.bottom + 6;
  const top = below + b.offsetHeight > window.innerHeight ? r.top - b.offsetHeight - 6 : below;
  b.style.left = `${left + window.scrollX}px`;
  b.style.top = `${top + window.scrollY}px`;
}

/**
 * Tooltip on hover and on keyboard focus; text is read when it is shown, so it follows the language.
 * @param {HTMLElement} host
 * @param {() => string} text
 */
export function attachTip(host, text) {
  host.addEventListener("mouseenter", () => show(host, text));
  host.addEventListener("focus", () => show(host, text));
  host.addEventListener("mouseleave", scheduleHide);
  host.addEventListener("blur", scheduleHide);
}

/**
 * Click-to-open note (ⓘ) for explanations of a few lines; works with touch. The text goes to a live region.
 * @param {() => string} text
 * @param {() => string} label the button's accessible name
 * @returns {HTMLElement}
 */
export function toggletip(text, label) {
  const wrap = document.createElement("span");
  wrap.className = "toggletip";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.setAttribute("aria-expanded", "false");
  button.append(icon("info"));
  const note = document.createElement("span");
  note.className = "toggletip-note";
  note.setAttribute("role", "status");
  const labelUpdate = () => button.setAttribute("aria-label", label());
  const close = () => {
    note.textContent = "";
    note.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  note.hidden = true;
  button.addEventListener("click", () => {
    if (!note.hidden) return close();
    note.hidden = false;
    note.textContent = text();
    button.setAttribute("aria-expanded", "true");
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !note.hidden) {
      e.preventDefault();
      close();
      button.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!note.hidden && !wrap.contains(/** @type {Node} */ (e.target))) close();
  });
  wrap.addEventListener("relabel", labelUpdate);
  labelUpdate();
  wrap.append(button, note);
  return wrap;
}

/** Refresh the accessible name of every toggletip after a language change. */
export function relabelToggletips() {
  for (const w of document.querySelectorAll(".toggletip")) w.dispatchEvent(new Event("relabel"));
}
