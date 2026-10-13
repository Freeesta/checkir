// @ts-check
import { showDialog } from "./dialogs.js";
import { el } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { buildProposer } from "./proponi_ui.js";
import { historyUrl } from "./proponi.js";
import { isApproved, loadSheet, loadSources, parseParagraphs, SECTIONS, sectionStatus, sectionText } from "./schede.js";

/** Names of the sections (literal keys, so the catalog check can see them). @type {Record<string, () => string>} */
const TITLES = {
  molecule: () => t("sheets.section.molecule"),
  category: () => t("sheets.section.category"),
  effects: () => t("sheets.section.effects"),
  doses: () => t("sheets.section.doses"),
  risks: () => t("sheets.section.risks"),
  interactions: () => t("sheets.section.interactions"),
  sources: () => t("sheets.section.sources"),
  license: () => t("sheets.section.license"),
};

/** State words (literal keys). @type {Record<string, () => string>} */
const STATES = { draft: () => t("sheets.state.draft"), in_review: () => t("sheets.state.in_review"), approved: () => t("sheets.state.approved") };

/** Base of a DOI link, opened only on the user's click. */
const DOI = "https://doi.org/";

/** @param {import("./schede.js").Source} s @returns {Array<Node | string>} */
function sourceLine(s) {
  const text = s.year ? `${s.title} (${s.year})` : s.title;
  const href = s.doi ? DOI + s.doi : s.url;
  if (!href || !href.startsWith("https:")) return [text];
  return [text, " ", el("a", { href, target: "_blank", rel: "noopener noreferrer" }, [t("sheets.open_source")])];
}

/** The "propose a change" button of a section; it opens the editor under the text and closes it again. @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {Set<string>} known @returns {HTMLElement} */
function proposeControl(sheet, key, lang, known) {
  const button = el("button", { type: "button", class: "propose-toggle", "data-fk": "propose", "aria-expanded": "false" }, [t("propose.button")]);
  const wrap = el("div", { class: "propose-wrap" }, [button]);
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    if (open) return wrap.querySelector(".propose")?.remove();
    const current = sectionStatus(sheet, key, lang) === "empty" ? "" : sectionText(sheet, key, lang);
    wrap.append(buildProposer(sheet, key, lang, current, known));
    wrap.querySelector("textarea")?.focus();
  });
  return wrap;
}

/** One section: title, state, and the text with numbered citations, or "not written yet". @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {Set<string>} known @returns {HTMLElement} */
function sectionView(sheet, key, lang, order, known) {
  const state = sheet.section_state[key] ?? "draft";
  const box = el("section", { class: "sheet-section", "data-section": key, "data-state": state, "aria-labelledby": `sh-${key}` }, [
    el("h3", { id: `sh-${key}` }, [TITLES[key](), " ", el("span", { class: "state-tag" }, [(STATES[state] ?? STATES.draft)()])]),
  ]);
  if (sectionStatus(sheet, key, lang) === "empty") {
    box.append(el("p", { class: "empty", "data-empty": "1" }, [t("sheets.empty")]), proposeControl(sheet, key, lang, known));
    return box;
  }
  for (const parts of parseParagraphs(sectionText(sheet, key, lang), order)) {
    box.append(el("p", {}, parts.map((p) => ("ref" in p ? el("sup", { class: "ref" }, [`[${formatNumber(p.n)}]`]) : p.text))));
  }
  box.append(proposeControl(sheet, key, lang, known));
  return box;
}

/** The whole sheet: version line, the eight sections, the numbered sources. @param {import("./schede.js").Sheet} sheet @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @returns {HTMLElement} */
export function buildSheetView(sheet, sources, lang) {
  const root = el("div", { class: "substance-sheet", "data-substance": sheet.id }, []);
  const signed = SECTIONS.filter((k) => isApproved(sheet, k)).length;
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(sheet.version), signed: formatNumber(signed), total: formatNumber(SECTIONS.length), until: sheet.review_by })]));
  /** @type {string[]} */
  const order = [];
  const known = new Set(Object.keys(sources));
  for (const key of SECTIONS) root.append(sectionView(sheet, key, lang, order, known));
  if (order.length) {
    const list = el("ol", { class: "sheet-sources", "aria-label": t("sheets.sources_list") });
    for (const id of order) list.append(el("li", { "data-source": id }, sources[id] ? sourceLine(sources[id]) : [id]));
    root.append(list);
  }
  root.append(el("p", {}, [el("a", { href: historyUrl(sheet.id), target: "_blank", rel: "noopener noreferrer", "data-fk": "sheet-history" }, [t("propose.history")])]));
  return root;
}

/** Opens the sheet of a substance in a dialog; says so when the site has none. @param {string} id @param {string} fallbackName */
export async function openSheet(id, fallbackName) {
  const [sheet, sources] = await Promise.all([loadSheet(id), loadSources()]);
  const lang = currentLang() === "it" ? "it" : "en";
  if (!sheet) return showDialog(fallbackName, [el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")])]);
  showDialog(sheet.names[lang] ?? sheet.names.en ?? fallbackName, [buildSheetView(sheet, sources, lang)]);
}
