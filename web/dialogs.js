// @ts-check
import { el, icon } from "./dom.js";
import { t } from "./i18n.js";
import { APP_NAME } from "./appname.js";
import { helpBody } from "./help.js";
import { autoMatchOn, setAutoMatch } from "./match.js";

/** The switch of the automatic comparison (stored preference `autoMatch`). @returns {HTMLElement} */
function autoMatchSwitch() {
  const box = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", role: "switch", id: "auto-match-switch" }));
  box.checked = autoMatchOn();
  box.addEventListener("change", () => setAutoMatch(box.checked));
  return el("div", { class: "switch-row" }, [box, el("label", { for: "auto-match-switch" }, [t("info.auto_match")])]);
}

/**
 * Modal dialogs (native <dialog>), rebuilt each time they open so they are always in the active language.
 * @param {() => string | null} engineVersion
 * @returns {(id: string) => void} open
 */
export function buildDialogs(engineVersion) {
  /** @type {Record<string, () => { titleKey: string, body: Node[] }>} */
  const makers = {
    info: () => ({
      titleKey: "info.title",
      body: [
        el("section", {}, [el("h3", {}, [t("info.match_title")]), autoMatchSwitch(), el("p", { class: "empty" }, [t("info.auto_match_hint")])]),
        el("section", {}, [el("h3", {}, [t("info.pages_title")]), el("nav", { class: "footer-links", "aria-label": t("info.pages_title") }, [
          el("a", { href: "pagine/avvertenze/" }, [t("info.link_warnings")]),
          el("a", { href: "pagine/informativa/" }, [t("info.link_notice")]),
          el("a", { href: "teoria/" }, [t("info.link_theory")]),
        ])]),
        el("section", {}, [
          el("h3", {}, [t("info.versions_title")]),
          el("p", {}, [`${APP_NAME} · ${engineVersion() ? t("engine.version", { version: engineVersion() ?? "" }) : t("engine.error")}`]),
        ]),
      ],
    }),
    help: () => ({ titleKey: "help.title", body: helpBody() }),
  };
  return (id) => {
    const make = makers[id];
    if (!make) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { titleKey, body } = make();
    const close = el("button", { type: "button", class: "icon-button", "aria-label": t("dialog.close") }, [icon("close")]);
    const dialog = el("dialog", { class: "dialog", "aria-labelledby": "dialog-title" }, [
      el("div", { class: "dialog-head" }, [el("h2", { id: "dialog-title" }, [t(titleKey)]), close]),
      el("div", { class: "dialog-body" }, body),
    ]);
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      opener?.focus();
    });
    document.body.append(dialog);
    dialog.showModal();
  };
}
