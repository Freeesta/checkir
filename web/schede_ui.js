// @ts-check
import { showDialog } from "./dialogs.js";
import { el } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { buildProposer } from "./proponi_ui.js";
import { historyUrl } from "./proponi.js";
import { FAMILY_SECTIONS, isApproved, loadClasses, loadFamily, loadSheet, loadSources, SECTIONS, sectionStatus, sectionText } from "./schede.js";
import { counsellingPoints, cutsBlock, effectiveText, identityBlock, idName, interactionsBlock, originBlock, paragraphs, sourcesList, structureFigure } from "./schede_dati.js";
import { metabolismBlock } from "./metabolismo_ui.js";

/** Names of the sections (literal keys, so the catalog check can see them). @type {Record<string, () => string>} */
export const TITLES = {
  molecule: () => t("sheets.section.molecule"),
  category: () => t("sheets.section.category"),
  history: () => t("sheets.section.history"),
  origin: () => t("sheets.section.origin"),
  metabolism: () => t("sheets.section.metabolism"),
  cuts: () => t("sheets.section.cuts"),
  effects: () => t("sheets.section.effects"),
  doses: () => t("sheets.section.doses"),
  risks: () => t("sheets.section.risks"),
  interactions: () => t("sheets.section.interactions"),
  counselling: () => t("sheets.section.counselling"),
  sources: () => t("sheets.section.sources"),
  license: () => t("sheets.section.license"),
};

/** State words (literal keys). @type {Record<string, () => string>} */
export const STATES = { draft: () => t("sheets.state.draft"), in_review: () => t("sheets.state.in_review"), approved: () => t("sheets.state.approved") };

/**
 * What a view of a sheet needs besides the sheet: its family sheet, the names of the classes and what the program computes about the cuts.
 * @typedef {{ family: import("./schede.js").FamilySheet | null, classes: Record<string, { names: Record<string, string> }>, cuts: import("./schede_tagli.js").CutContext }} SheetExtras
 */

/** @type {SheetExtras} */
const NO_EXTRAS = { family: null, classes: {}, cuts: { local: new Set(), found: new Set() } };

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

/** The data blocks of a section (identity, drawing, origin, metabolism, cuts, interactions), computed from the sheet. @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {SheetExtras} x @returns {Array<HTMLElement | null>} */
function dataBlocks(sheet, key, lang, order, x) {
  const name = sheet.names[lang] ?? sheet.names.en ?? sheet.id;
  const nameOf = (/** @type {string} */ id) => idName(id, lang, x.classes);
  switch (key) {
    case "molecule": return [identityBlock(sheet), structureFigure(sheet, name)];
    case "origin": return [originBlock(sheet.origin, order)];
    case "metabolism": return [metabolismBlock(sheet.metabolism, order, name)];
    case "cuts": return [cutsBlock(sheet, order, x.cuts, nameOf)];
    case "interactions": return [interactionsBlock(sheet.interactions?.length ? sheet.interactions : (/** @type {any} */ (x.family)?.interactions), order, nameOf)];
    default: return [];
  }
}

/** The text of a section: the talking points of the interview with their topics, or paragraphs; a family's text carries the family's name. @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {SheetExtras} x @returns {HTMLElement[]} */
function textNodes(sheet, key, lang, order, x) {
  const { text, fromFamily } = effectiveText(sheet, x.family, key, lang);
  if (!text) return [];
  const body = key === "counselling" && !fromFamily ? counsellingPoints(sheet, text, order) : paragraphs(text, order);
  const label = fromFamily && x.family ? [el("p", { class: "note", "data-family-text": x.family.id }, [t("sheets.family_label", { name: x.family.names[lang] ?? x.family.names.en ?? x.family.id })])] : [];
  return [...label, ...body];
}

/** The content of a section without its heading: text and data blocks. @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {SheetExtras} x @returns {HTMLElement[]} */
export function sectionNodes(sheet, key, lang, order, x) {
  const blocks = dataBlocks(sheet, key, lang, order, x).filter((b) => b !== null);
  return [...textNodes(sheet, key, lang, order, x), ...blocks];
}

/** One section: title, state, the text with numbered citations and the data blocks, or "not written yet". @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {Set<string>} known @param {SheetExtras} x @returns {HTMLElement} */
function sectionView(sheet, key, lang, order, known, x) {
  const state = sheet.section_state[key] ?? "draft";
  const box = el("section", { class: "sheet-section", "data-section": key, "data-state": state, "aria-labelledby": `sh-${key}` }, [
    el("h3", { id: `sh-${key}` }, [TITLES[key](), " ", el("span", { class: "state-tag" }, [(STATES[state] ?? STATES.draft)()])]),
  ]);
  const nodes = sectionNodes(sheet, key, lang, order, x);
  if (!nodes.length) box.append(el("p", { class: "empty", "data-empty": "1" }, [t("sheets.empty")]));
  box.append(...nodes, proposeControl(sheet, key, lang, known));
  return box;
}

/** The whole sheet: version line, the thirteen sections, the numbered sources. @param {import("./schede.js").Sheet} sheet @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @param {SheetExtras} [extras] @returns {HTMLElement} */
export function buildSheetView(sheet, sources, lang, extras = NO_EXTRAS) {
  const root = el("div", { class: "substance-sheet", "data-substance": sheet.id }, []);
  const signed = SECTIONS.filter((k) => isApproved(sheet, k)).length;
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(sheet.version), signed: formatNumber(signed), total: formatNumber(SECTIONS.length), until: sheet.review_by })]));
  /** @type {string[]} */
  const order = [];
  const known = new Set(Object.keys(sources));
  for (const key of SECTIONS) root.append(sectionView(sheet, key, lang, order, known, extras));
  const list = sourcesList(order, sources);
  if (list) root.append(list);
  root.append(el("p", {}, [el("a", { href: historyUrl(sheet.id), target: "_blank", rel: "noopener noreferrer", "data-fk": "sheet-history" }, [t("propose.history")])]));
  return root;
}

/** The sheet of a family: the sections a family holds, with the signing state of each, the interactions as a table and the numbered sources. @param {import("./schede.js").FamilySheet} family @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @param {Record<string, { names: Record<string, string> }>} classes @returns {HTMLElement} */
export function buildFamilyView(family, sources, lang, classes) {
  const root = el("div", { class: "substance-sheet family-sheet", "data-family": family.id }, []);
  const signed = FAMILY_SECTIONS.filter((k) => isApproved(family, k)).length;
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(family.version), signed: formatNumber(signed), total: formatNumber(FAMILY_SECTIONS.length), until: family.review_by })]));
  /** @type {string[]} */
  const order = [];
  for (const key of FAMILY_SECTIONS) {
    const state = family.section_state[key] ?? "draft";
    const box = el("section", { class: "sheet-section", "data-section": key, "data-state": state, "aria-labelledby": `sh-${key}` }, [
      el("h3", { id: `sh-${key}` }, [TITLES[key](), " ", el("span", { class: "state-tag" }, [(STATES[state] ?? STATES.draft)()])]),
    ]);
    const text = sectionStatus(family, key, lang) === "empty" ? "" : sectionText(family, key, lang);
    const table = key === "interactions" ? interactionsBlock(family.interactions, order, (id) => idName(id, lang, classes)) : null;
    if (!text && !table) box.append(el("p", { class: "empty", "data-empty": "1" }, [t("sheets.empty")]));
    box.append(...(text ? paragraphs(text, order) : []), ...(table ? [table] : []));
    root.append(box);
  }
  const list = sourcesList(order, sources);
  if (list) root.append(list);
  return root;
}

/** What a sheet needs besides itself, read once: its family, the class names. @param {import("./schede.js").Sheet} sheet @param {import("./schede_tagli.js").CutContext} cuts @returns {Promise<SheetExtras>} */
export async function loadExtras(sheet, cuts) {
  const [family, classes] = await Promise.all([sheet.family ? loadFamily(sheet.family) : Promise.resolve(null), loadClasses()]);
  return { family, classes, cuts };
}

/** Opens the sheet of a substance in a dialog; says so when the site has none. @param {string} id @param {string} fallbackName @param {import("./schede_tagli.js").CutContext} [cuts] */
export async function openSheet(id, fallbackName, cuts = NO_EXTRAS.cuts) {
  const [sheet, sources] = await Promise.all([loadSheet(id), loadSources()]);
  const lang = currentLang() === "it" ? "it" : "en";
  if (!sheet) return showDialog(fallbackName, [el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")])]);
  const view = buildSheetView(sheet, sources, lang, await loadExtras(sheet, cuts));
  view.append(el("p", {}, [el("a", { href: `pagine/schede/#${sheet.id}`, target: "_blank", rel: "noopener", "data-fk": "sheet-page" }, [t("sheets.all_sheets")])]));
  showDialog(sheet.names[lang] ?? sheet.names.en ?? fallbackName, [view]);
}
