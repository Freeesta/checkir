// @ts-check
import { el } from "./dom.js";
import { currentLang, t } from "./i18n.js";
import { loadSheet, loadSources } from "./schede.js";
import { buildSheetView, loadExtras } from "./schede_ui.js";
import { getState, subscribe } from "./state.js";
import { focusedTab } from "./tabs.js";

/**
 * The pane of a substance tab (`#sheet-pane`, built here next to `#pane-main`): it holds the DOM of the sheet in focus only; the data are read again at every activation
 * (the tab keeps just the id, the name and the cuts). While a substance tab has the focus the main pane is hidden.
 * @typedef {import("./state.js").Tab} Tab
 */

/** What the pane shows now (tab id and language), the run of the latest render and the tab whose title must take the focus when it is drawn. */
const shown = { key: /** @type {string | null} */ (null), run: 0, focusTitle: /** @type {string | null} */ (null) };

/** @returns {HTMLElement | null} the pane of the substance tabs, made on first use */
function sheetPane() {
  const found = document.getElementById("sheet-pane");
  if (found) return found;
  const main = document.getElementById("pane-main");
  if (!main) return null;
  const pane = el("section", { id: "sheet-pane", class: "pane pane-sheet", role: "tabpanel", hidden: "" });
  main.after(pane);
  return pane;
}

/** The whole sheet of a substance in the pane: title (focused when the tab was just opened), 13 sections, sources, link to the page; or the line saying the site has none. @param {HTMLElement} host @param {Tab} tab */
export async function renderSheetTab(host, tab) {
  const info = tab.sheet;
  if (!info) return;
  const run = ++shown.run;
  const lang = currentLang() === "it" ? "it" : "en";
  const [sheet, sources] = await Promise.all([loadSheet(info.id), loadSources()]);
  const extras = sheet ? await loadExtras(sheet, info.cuts) : null;
  if (run !== shown.run) return;
  const title = el("h2", { id: "sheet-title", tabindex: "-1" }, [sheet?.names[lang] ?? sheet?.names.en ?? info.name]);
  if (!sheet || !extras) host.replaceChildren(title, el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")]));
  else {
    const view = buildSheetView(sheet, sources, lang, extras);
    view.append(el("p", {}, [el("a", { href: `pagine/schede/#${sheet.id}`, target: "_blank", rel: "noopener", "data-fk": "sheet-page" }, [t("sheets.all_sheets")])]));
    host.replaceChildren(title, view);
  }
  if (shown.focusTitle === tab.id) {
    shown.focusTitle = null;
    title.focus();
  }
}

/** Show the pane of the focused substance tab and hide the main one, or the other way round; draw the sheet only when the tab or the language changed. @param {import("./state.js").AppState} s */
export function syncSheetPane(s) {
  const pane = sheetPane();
  const main = document.getElementById("pane-main");
  if (!pane || !main) return;
  const tab = focusedTab(s);
  const on = tab?.kind === "sheet" ? tab : null;
  main.hidden = on !== null;
  pane.hidden = on === null;
  document.body.toggleAttribute("data-sheet-tab", on !== null);
  if (!on) {
    if (shown.key !== null) {
      shown.key = null;
      shown.run++;
      pane.replaceChildren();
    }
    return;
  }
  pane.setAttribute("aria-labelledby", `tab-${on.id}`);
  const key = `${on.id}/${currentLang()}`;
  if (key === shown.key) return;
  shown.key = key;
  void renderSheetTab(pane, on);
}

if (typeof document !== "undefined") {
  // The opener of a sheet asks for the focus on the title through this event (schede_ui.js cannot import this module without a cycle).
  document.addEventListener("sheet-opened", (e) => {
    shown.focusTitle = String(/** @type {CustomEvent} */ (e).detail);
    shown.key = null;
  });
  sheetPane();
  subscribe(syncSheetPane);
  new MutationObserver(() => syncSheetPane(getState())).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}
