// @ts-check
import { el } from "./dom.js";
import { t } from "./i18n.js";
import { getState, resultOf, update } from "./state.js";
import { syncSheetHost } from "./sheet.js";

/**
 * Talk mode (`m`): the sheet fills the screen in big letters, with no panel, chart or score, to show it to the person.
 * Esc or the one button leaves it. Print uses the same host (`#sheet-host`), which is hidden on screen otherwise.
 */

/** Actions of talk mode and print that need the state. @param {(text: string) => void} announce */
export function talkActions(announce) {
  return {
    toggleTalk: () => {
      const on = !getState().talk;
      update({ talk: on });
      announce(on ? t("status.talk_on") : t("status.talk_off"));
    },
    printSheet: () => window.print(),
  };
}

/**
 * Own the hidden sheet host: keep its sheet current, show it in talk mode and hand the focus back when talk mode ends.
 * @param {HTMLElement} host
 * @returns {{ refresh: (s: import("./state.js").AppState) => void }}
 */
export function wireTalk(host) {
  const exit = el("button", { type: "button", class: "btn talk-exit", "data-fk": "talk-exit" });
  /** @type {Element | null} */
  let before = null;
  exit.addEventListener("click", () => update({ talk: false }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !getState().talk) return;
    e.preventDefault();
    update({ talk: false });
  });
  return {
    refresh(s) {
      const on = s.talk && resultOf(s) !== null;
      if (s.talk && !on) return void update({ talk: false });
      syncSheetHost(host, s);
      exit.textContent = t("talk.exit");
      host.prepend(exit);
      host.setAttribute("aria-label", t("sheet.title"));
      if (on === (document.body.dataset.talk === "1")) return;
      if (on) {
        before = document.activeElement;
        document.body.dataset.talk = "1";
        exit.focus();
      } else {
        delete document.body.dataset.talk;
        if (before instanceof HTMLElement) before.focus();
      }
    },
  };
}
