// @ts-check
// Start-up of the static text pages (pagine/avvertenze, pagine/informativa): theme, language, header, catalog texts.
import { APP_NAME, GITHUB_URL } from "./appname.js";
import { applyCatalog, currentLang, loadLang, pickLang } from "./i18n.js";
import { buildHeader } from "./pagina_header.js";
import { initTheme } from "./theme.js";

async function start() {
  initTheme();
  for (const a of document.querySelectorAll("a[data-repo-path]")) a.setAttribute("href", GITHUB_URL + a.getAttribute("data-repo-path"));
  await loadLang(pickLang());
  const heading = /** @type {HTMLElement} */ (document.querySelector("h1"));
  const refreshHeader = buildHeader(async () => render());
  const render = () => {
    applyCatalog();
    refreshHeader();
    document.title = `${heading.textContent} · ${APP_NAME}`;
    document.body.dataset.langReady = currentLang();
  };
  render();
  document.body.dataset.ready = "1";
}

start();
