// @ts-check
// Start-up of the static text pages (pagine/avvertenze, pagine/informativa): theme, language, header, catalog texts.
import { APP_NAME } from "./appname.js";
import { buildWarningsBox } from "./avvertenze.js";
import { el } from "./dom.js";
import { applyCatalog, currentLang, LANGS, loadLang, pickLang, t } from "./i18n.js";
import { initTheme } from "./theme.js";

/** The language buttons and the brand link back to the application. @param {() => Promise<void>} change @returns {() => void} refresh */
function buildHeader(change) {
  const host = /** @type {HTMLElement} */ (document.getElementById("app-header"));
  const brand = el("a", { class: "brand", href: "../../" }, [el("span", { class: "logo", "aria-hidden": "true" }), el("span", { class: "app-name" }, [APP_NAME])]);
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

async function start() {
  initTheme();
  await loadLang(pickLang());
  const slot = document.getElementById("warnings-box");
  const box = slot ? buildWarningsBox(slot) : null;
  const heading = /** @type {HTMLElement} */ (document.querySelector("h1"));
  const refreshHeader = buildHeader(async () => render());
  const render = () => {
    applyCatalog();
    box?.refresh();
    refreshHeader();
    document.title = `${heading.textContent} · ${APP_NAME}`;
  };
  render();
  document.body.dataset.ready = "1";
}

start();
