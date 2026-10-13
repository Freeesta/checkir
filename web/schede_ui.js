// @ts-check
import { showDialog } from "./dialogs.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { isApproved, isDraft, loadSheet, loadSources, parseParagraphs, SECTIONS, sectionStatus, sectionText } from "./schede.js";

/** Names of the sections (literal keys, so the catalog check can see them). @type {Record<string, () => string>} */
const TITLES = {
  molecule: () => t("sheets.section.molecule"),
  category: () => t("sheets.section.category"),
  ftir_limits: () => t("sheets.section.ftir_limits"),
  effects: () => t("sheets.section.effects"),
  doses: () => t("sheets.section.doses"),
  risks: () => t("sheets.section.risks"),
  interactions: () => t("sheets.section.interactions"),
  harm_reduction: () => t("sheets.section.harm_reduction"),
  sources: () => t("sheets.section.sources"),
  license: () => t("sheets.section.license"),
};

/** State words (literal keys). @type {Record<string, () => string>} */
const STATES = { draft: () => t("sheets.state.draft"), in_review: () => t("sheets.state.in_review"), approved: () => t("sheets.state.approved") };

/** @param {import("./schede.js").Source} s @returns {Array<Node | string>} */
function sourceLine(s) {
  const text = s.year ? `${s.title} (${s.year})` : s.title;
  const href = s.doi ? `https://doi.org/${s.doi}` : s.url;
  if (!href || !/^https:\/\//.test(href)) return [text];
  return [text, " ", el("a", { href, target: "_blank", rel: "noopener noreferrer" }, [t("sheets.open_source")])];
}

/** One section: title, state, and the text with numbered citations, or "in preparation". @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @returns {HTMLElement} */
function sectionView(sheet, key, lang, order) {
  const state = sheet.section_state[key] ?? "draft";
  const box = el("section", { class: "sheet-section", "data-section": key, "data-state": state, "aria-labelledby": `sh-${key}` }, [
    el("h3", { id: `sh-${key}` }, [TITLES[key](), " ", el("span", { class: "state-tag" }, [(STATES[state] ?? STATES.draft)()])]),
  ]);
  if (sectionStatus(sheet, key, lang) === "preparing") {
    box.append(el("p", { class: "empty", "data-preparing": "1" }, [icon("warning"), t("sheets.preparing")]));
    return box;
  }
  for (const parts of parseParagraphs(sectionText(sheet, key, lang), order)) {
    box.append(el("p", {}, parts.map((p) => ("ref" in p ? el("sup", { class: "ref" }, [`[${formatNumber(p.n)}]`]) : p.text))));
  }
  return box;
}

/** The whole sheet: draft banner, version line, the ten sections, the numbered sources. @param {import("./schede.js").Sheet} sheet @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @returns {HTMLElement} */
export function buildSheetView(sheet, sources, lang) {
  const root = el("div", { class: "substance-sheet", "data-substance": sheet.id }, []);
  if (isDraft(sheet)) root.append(el("p", { class: "draft-banner", role: "note" }, [icon("warning"), el("strong", {}, [t("sheets.banner")]), " ", t("sheets.banner_more")]));
  const signed = SECTIONS.filter((k) => isApproved(sheet, k)).length;
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(sheet.version), signed: formatNumber(signed), total: formatNumber(SECTIONS.length), until: sheet.review_by })]));
  /** @type {string[]} */
  const order = [];
  for (const key of SECTIONS) root.append(sectionView(sheet, key, lang, order));
  if (order.length) {
    const list = el("ol", { class: "sheet-sources", "aria-label": t("sheets.sources_list") });
    for (const id of order) list.append(el("li", { "data-source": id }, sources[id] ? sourceLine(sources[id]) : [id]));
    root.append(list);
  }
  return root;
}

/** Opens the sheet of a substance in a dialog; says so when the site has none. @param {string} id @param {string} fallbackName */
export async function openSheet(id, fallbackName) {
  const [sheet, sources] = await Promise.all([loadSheet(id), loadSources()]);
  const lang = currentLang() === "it" ? "it" : "en";
  if (!sheet) return showDialog(fallbackName, [el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")])]);
  showDialog(sheet.names[lang] ?? sheet.names.en ?? fallbackName, [buildSheetView(sheet, sources, lang)]);
}
