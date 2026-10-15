// @ts-check
// Header of the static pages (text pages and the theory section): brand link back to the application and the language menu.
import { APP_NAME } from "./appname.js";
import { el } from "./dom.js";
import { loadLang } from "./i18n.js";
import { buildLangMenu } from "./lang_menu.js";

/** The language menu and the brand link back to the application. @param {() => Promise<void> | void} change @param {string} [home] relative address of the application @returns {() => void} refresh */
export function buildHeader(change, home = "../../") {
  const host = /** @type {HTMLElement} */ (document.getElementById("app-header"));
  const brand = el("a", { class: "brand", href: home }, [el("span", { class: "logo", "aria-hidden": "true" }), el("span", { class: "app-name" }, [APP_NAME])]);
  const menu = buildLangMenu(async (code) => {
    await loadLang(code);
    await change();
  });
  host.append(brand, el("div", { class: "page-tools" }, [menu.root]));
  return () => menu.refresh();
}
