// @ts-check
// Header of the static pages (text pages and the theory section): brand link back to the application and the language buttons.
import { APP_NAME } from "./appname.js";
import { el } from "./dom.js";
import { currentLang, LANGS, loadLang, t } from "./i18n.js";

/** The language buttons and the brand link back to the application. @param {() => Promise<void> | void} change @param {string} [home] relative address of the application @returns {() => void} refresh */
export function buildHeader(change, home = "../../") {
  const host = /** @type {HTMLElement} */ (document.getElementById("app-header"));
  const brand = el("a", { class: "brand", href: home }, [el("span", { class: "logo", "aria-hidden": "true" }), el("span", { class: "app-name" }, [APP_NAME])]);
  const group = el("div", { class: "lang-group", role: "group" });
  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map();
  for (const code of LANGS) {
    const b = el("button", { type: "button", class: "lang-button", lang: code, "data-lang": code }, [code.toUpperCase()]);
    b.addEventListener("click", async () => {
      if (code === currentLang()) return;
      await loadLang(code);
      await change();
    });
    buttons.set(code, b);
    group.append(b);
  }
  host.append(brand, el("div", { class: "page-tools" }, [group]));
  return () => {
    group.setAttribute("aria-label", t("lang.label"));
    for (const [code, b] of buttons) {
      b.setAttribute("aria-pressed", String(code === currentLang()));
      b.setAttribute("aria-label", code === "it" ? t("lang.it") : t("lang.en"));
    }
  };
}
