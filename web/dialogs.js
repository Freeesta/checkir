// @ts-check
import { el, icon } from "./dom.js";
import { t } from "./i18n.js";
import { APP_NAME } from "./appname.js";

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
        el("section", {}, [el("h3", {}, [t("info.privacy_title")]), el("p", {}, [t("info.privacy")])]),
        el("section", {}, [el("h3", {}, [t("info.limits_title")]), el("p", {}, [t("limits.more")])]),
        el("section", { id: "warnings-slot" }, [el("h3", {}, [t("info.warnings_title")]), el("p", { class: "empty" }, [t("info.warnings_empty")])]),
        el("section", {}, [
          el("h3", {}, [t("info.versions_title")]),
          el("p", {}, [`${APP_NAME} · ${engineVersion() ? t("engine.version", { version: engineVersion() ?? "" }) : t("engine.error")}`]),
        ]),
      ],
    }),
    help: () => ({ titleKey: "help.title", body: [el("div", { id: "shortcuts-slot" }, [el("p", { class: "empty" }, [t("help.soon")])])] }),
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
