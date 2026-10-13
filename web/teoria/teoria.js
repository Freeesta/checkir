// @ts-check
// Start-up and navigation of the theory section ("Come funziona l'FTIR"): index, chapters (loaded when opened), glossary.
import { APP_NAME } from "../appname.js";
import { el } from "../dom.js";
import { loadEngine } from "../engine.js";
import { applyCatalog, currentLang, loadLang, pickLang, t } from "../i18n.js";
import { buildHeader } from "../pagina_header.js";
import { initTheme } from "../theme.js";
import { renderChapter } from "./chapter.js";
import { loadChapter, loadGlossary, loadIndex, loadSources } from "./content.js";
import { renderGlossary } from "./glossary.js";

/** @typedef {import("./content.js").IndexEntry} IndexEntry */

/** @type {Promise<import("../engine.js").Engine> | null} */
let engine = null;
/** The engine is loaded on the first chapter that needs it. @returns {Promise<import("../engine.js").Engine>} */
const getEngine = () => (engine ??= loadEngine());

const host = /** @type {HTMLElement} */ (document.getElementById("view"));

/** @param {IndexEntry[]} chapters @returns {HTMLElement} */
function renderIndex(chapters) {
  const title = el("h1", { id: "view-title", tabindex: "-1" }, [t("teoria.title")]);
  const list = el("ol", { class: "chapters" }, chapters.map((c) => el("li", {}, [el("a", { href: `#${c.n}` }, [c.title])])));
  host.replaceChildren(title, el("p", {}, [t("teoria.intro")]), el("nav", { "aria-label": t("teoria.nav") }, [list]), el("p", {}, [el("a", { href: "#glossario" }, [t("teoria.glossary.title")])]));
  return title;
}

/** @param {string} hash @returns {Promise<{ target: HTMLElement, name: string }>} */
async function render(hash) {
  const lang = currentLang();
  const { chapters } = await loadIndex(lang);
  const n = /^\d+$/.test(hash) ? Number(hash) : 0;
  const entry = chapters.find((c) => c.n === n);
  if (entry) {
    const [chapter, sources] = await Promise.all([loadChapter(lang, entry), loadSources()]);
    const map = new Map(sources.sources.map((s) => [s.id, s]));
    const target = renderChapter(host, chapter, { chapters, sources: map, ctx: { engine: getEngine() } });
    return { target, name: chapter.title };
  }
  if (hash === "glossario" || hash.startsWith("g-")) {
    const { entries } = await loadGlossary(lang);
    const sorted = [...entries].sort((a, b) => a.term.localeCompare(b.term, lang));
    const target = renderGlossary(host, sorted, hash.startsWith("g-") ? hash.slice(2) : null);
    return { target, name: t("teoria.glossary.title") };
  }
  return { target: renderIndex(chapters), name: t("teoria.title") };
}

async function start() {
  initTheme();
  await loadLang(pickLang());
  let first = true;
  const refreshHeader = buildHeader(() => show(), "../");
  async function show() {
    try {
      const { target, name } = await render(location.hash.slice(1));
      document.title = `${name} · ${t("teoria.title")} · ${APP_NAME}`;
      applyCatalog();
      refreshHeader();
      if (!first) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "start" });
      } else if (target.id.startsWith("g-")) target.scrollIntoView({ block: "center" });
    } catch {
      host.replaceChildren(el("p", { class: "error", role: "alert" }, [t("teoria.load_error")]));
      refreshHeader();
    }
    first = false;
  }
  window.addEventListener("hashchange", () => void show());
  await show();
  applyCatalog();
  document.body.dataset.ready = "1";
}

start();
