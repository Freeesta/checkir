// @ts-check
// The page of the substance sheets: the list (search by name or synonym, filter by class), one full sheet (#<id>) and one family sheet (#famiglia-<id>).
// The sheets are public data read from schede/; nothing about the user is read or kept.
import { APP_NAME } from "../../appname.js";
import { el } from "../../dom.js";
import { applyCatalog, currentLang, formatNumber, loadLang, pickLang, t } from "../../i18n.js";
import { normalize } from "../../nomi.js";
import { buildHeader } from "../../pagina_header.js";
import { loadClasses, loadFamily, loadSheet, loadSheetIndex, loadSources, SECTIONS, sheetIndex } from "../../schede.js";
import { buildFamilyView, buildSheetView, loadExtras } from "../../schede_ui.js";
import { cutContext } from "../../schede_tagli.js";
import { initTheme } from "../../theme.js";

const view = /** @type {HTMLElement} */ (document.getElementById("view"));
const heading = /** @type {HTMLElement} */ (document.getElementById("page-title"));
/** Filters of the list, kept while the page is open. */
const filter = { query: "", cls: "" };
let drawing = 0;

/** @returns {"it" | "en"} */
const lang = () => (currentLang() === "it" ? "it" : "en");

/** @param {Record<string, string>} names @returns {string} */
const nameIn = (names) => names[lang()] ?? names.en ?? Object.values(names)[0] ?? "";

/** @param {string} text */
function announce(text) {
  const live = document.getElementById("status");
  if (live) live.textContent = text;
}

/** @param {string} text a title for the tab and the heading of the view */
function setTitle(text) {
  document.title = `${text} · ${APP_NAME}`;
}

/** @param {HTMLElement} node */
function focusHeading(node) {
  node.tabIndex = -1;
  node.focus();
}

/** @param {import("../../schede.js").IndexEntry} e @param {Record<string, { axis: string, names: Record<string, string> }>} classes @returns {string[]} */
function classNames(e, classes) {
  return [...(e.classes?.chemical ?? []), ...(e.classes?.effect ?? [])].map((id) => classes[id]?.names[lang()] ?? classes[id]?.names.en ?? id);
}

/** The entries that match the search (a name or synonym starts or contains the words) and the class. @param {import("../../schede.js").IndexEntry[]} entries @returns {import("../../schede.js").IndexEntry[]} */
function matching(entries) {
  const q = normalize(filter.query);
  return entries
    .filter((e) => (!filter.cls || [...(e.classes?.chemical ?? []), ...(e.classes?.effect ?? [])].includes(filter.cls)) && (!q || e.terms.some((x) => x.includes(q))))
    .sort((a, b) => nameIn(a.names).localeCompare(nameIn(b.names), lang()));
}

/** @param {Array<[string, string]>} options @returns {HTMLSelectElement} */
function classSelect(options) {
  const select = el("select", { id: "sheet-class", "data-fk": "sheets-class" }, [el("option", { value: "" }, [t("sheets.page.filter_all")]), ...options.map(([id, label]) => el("option", { value: id }, [label]))]);
  select.value = filter.cls;
  return select;
}

/** @param {import("../../schede.js").IndexEntry} e @param {Record<string, { axis: string, names: Record<string, string> }>} classes @returns {HTMLElement} */
function entryItem(e, classes) {
  const sub = [classNames(e, classes).join(", "), t("sheets.written_count", { written: formatNumber(e.written), total: formatNumber(SECTIONS.length) })].filter(Boolean).join(" · ");
  return el("li", { class: "sheet-entry", "data-sheet": e.id }, [el("a", { href: `#${e.id}`, class: "sheet-entry-link" }, [nameIn(e.names)]), el("span", { class: "note" }, [` ${sub}`])]);
}

/** The list: search and class filter, then the sheets, then the family sheets. @param {Record<string, { axis: string, names: Record<string, string> }>} classes */
function drawList(classes) {
  const index = sheetIndex();
  const used = new Set(index.entries.flatMap((e) => [...(e.classes?.chemical ?? []), ...(e.classes?.effect ?? [])]));
  /** @type {Array<[string, string]>} */
  const options = [...used].map((id) => /** @type {[string, string]} */ ([id, classes[id]?.names[lang()] ?? classes[id]?.names.en ?? id])).sort((a, b) => a[1].localeCompare(b[1], lang()));
  const search = el("input", { type: "search", id: "sheet-search", autocomplete: "off", "data-fk": "sheets-search" });
  search.value = filter.query;
  const select = classSelect(options);
  const results = el("ul", { class: "plain sheet-list", "aria-label": t("sheets.page.list") });
  const count = el("p", { class: "note", role: "status" });
  const refresh = () => {
    const found = matching(index.entries);
    results.replaceChildren(...found.map((e) => entryItem(e, classes)));
    count.textContent = found.length ? t("sheets.page.count", { n: formatNumber(found.length) }) : t("sheets.page.none");
  };
  search.addEventListener("input", () => { filter.query = search.value; refresh(); });
  select.addEventListener("change", () => { filter.cls = select.value; refresh(); });
  refresh();
  const families = index.families.map((f) => el("li", { "data-family": f.id }, [el("a", { href: `#famiglia-${f.id}` }, [nameIn(f.names)])]));
  view.replaceChildren(
    el("form", { class: "sheet-filters", role: "search", "aria-label": t("sheets.page.search") }, [
      el("label", { for: "sheet-search" }, [t("sheets.page.search")]), search,
      el("label", { for: "sheet-class" }, [t("sheets.page.filter")]), select,
    ]),
    count,
    results,
    ...(families.length ? [el("h2", {}, [t("sheets.page.families")]), el("ul", { class: "plain family-list" }, families)] : []),
  );
  const form = view.querySelector("form");
  form?.addEventListener("submit", (e) => e.preventDefault());
  setTitle(heading.textContent ?? "");
}

/** @returns {HTMLElement} */
const backLink = () => el("p", { class: "back" }, [el("a", { href: "#", "data-fk": "sheets-back" }, [t("sheets.page.back")])]);

/** One substance sheet or one family sheet. @param {string} hash @param {Record<string, { axis: string, names: Record<string, string> }>} classes @param {number} token */
async function drawSheet(hash, classes, token) {
  const family = hash.startsWith("famiglia-");
  const id = family ? hash.slice("famiglia-".length) : hash;
  const sources = await loadSources();
  const data = family ? await loadFamily(id) : await loadSheet(id);
  if (token !== drawing) return;
  if (!data) {
    view.replaceChildren(backLink(), el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")]));
    return;
  }
  const title = nameIn(data.names);
  const h2 = el("h2", { id: "sheet-title", tabindex: "-1" }, [title]);
  if (family) {
    view.replaceChildren(backLink(), h2, buildFamilyView(/** @type {import("../../schede.js").FamilySheet} */ (data), sources, lang(), classes));
  } else {
    const sheet = /** @type {import("../../schede.js").Sheet} */ (data);
    const extras = await loadExtras(sheet, cutContext([], []));
    if (token !== drawing) return;
    view.replaceChildren(backLink(), h2, buildSheetView(sheet, sources, lang(), extras));
  }
  setTitle(title);
  focusHeading(h2);
}

async function draw() {
  const token = ++drawing;
  const classes = await loadClasses();
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (token !== drawing) return;
  if (!hash) {
    drawList(classes);
    return;
  }
  await drawSheet(hash, classes, token);
}

async function start() {
  initTheme();
  await loadLang(pickLang());
  await new Promise((done) => loadSheetIndex(() => done(undefined)));
  const refreshHeader = buildHeader(async () => render());
  const render = () => {
    applyCatalog();
    refreshHeader();
    document.body.dataset.langReady = currentLang();
    return draw();
  };
  window.addEventListener("hashchange", () => void draw().then(() => announce(document.title)));
  await render();
  document.body.dataset.ready = "1";
}

void start();
