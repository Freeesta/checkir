// @ts-check
// The language picker shared by every header: one button that opens the list of the available languages (LANGS), a disclosure list usable with the keyboard (arrows, Home, End, Esc).
import { el } from "./dom.js";
import { currentLang, LANGS, LANG_NAMES, t } from "./i18n.js";

/**
 * @param {(code: string) => void | Promise<void>} choose called with the chosen language code
 * @returns {{ root: HTMLElement, refresh: () => void }}
 */
export function buildLangMenu(choose) {
  const trigger = el("button", { type: "button", class: "icon-button lang-trigger", id: "lang-button", "aria-expanded": "false", "aria-controls": "lang-list" });
  const code = el("span", { class: "lang-code" });
  trigger.append(code, el("span", { class: "lang-caret", "aria-hidden": "true" }));
  const list = el("ul", { class: "lang-list", id: "lang-list", hidden: "" });
  /** @type {Map<string, HTMLButtonElement>} */
  const items = new Map();
  for (const c of LANGS) {
    const b = el("button", { type: "button", class: "lang-item", lang: c, "data-lang": c, tabindex: "-1" }, [LANG_NAMES[c] ?? c.toUpperCase()]);
    b.addEventListener("click", () => {
      close(true);
      if (c !== currentLang()) void choose(c);
    });
    items.set(c, b);
    list.append(el("li", {}, [b]));
  }
  const root = el("div", { class: "lang-menu" }, [trigger, list]);
  const buttons = () => [...items.values()];
  /** @param {boolean} focusTrigger */
  function close(focusTrigger) {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focusTrigger) trigger.focus();
  }
  /** @param {HTMLButtonElement} [target] */
  function open(target) {
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    (target ?? items.get(currentLang()) ?? buttons()[0]).focus();
  }
  trigger.addEventListener("click", () => (list.hidden ? open() : close(true)));
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open(e.key === "ArrowUp" ? buttons()[buttons().length - 1] : undefined);
    }
  });
  list.addEventListener("keydown", (e) => {
    const all = buttons();
    const at = all.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const go = (/** @type {number} */ i) => {
      e.preventDefault();
      all[(i + all.length) % all.length].focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close(false);
  });
  document.addEventListener("click", (e) => {
    if (!list.hidden && !root.contains(/** @type {Node} */ (e.target))) close(false);
  });
  return {
    root,
    refresh() {
      code.textContent = currentLang().toUpperCase();
      trigger.setAttribute("aria-label", `${t("lang.label")}: ${LANG_NAMES[currentLang()] ?? currentLang()}`);
      for (const [c, b] of items) b.toggleAttribute("aria-current", c === currentLang());
    },
  };
}
