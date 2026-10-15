// @ts-check
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { FAMILY_SECTIONS, loadClasses, loadFamily, loadSheet, loadSources, SECTIONS, sectionStatus, sectionText, writtenCount } from "./schede.js";
import { counsellingPoints, cutsBlock, effectiveText, identityBlock, idName, interactionsBlock, originBlock, paragraphs, sourcesList, structureFigure } from "./schede_dati.js";
import { metabolismBlock } from "./metabolismo_ui.js";
import { getState, update } from "./state.js";
import { canOpenSheet, openSheetPatch, SHEETS_MAX } from "./tabs.js";

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

/**
 * What a view of a sheet needs besides the sheet: its family sheet, the names of the classes and what the program computes about the cuts.
 * @typedef {{ family: import("./schede.js").FamilySheet | null, classes: Record<string, { names: Record<string, string> }>, cuts: import("./schede_tagli.js").CutContext }} SheetExtras
 */

/** @type {SheetExtras} */
const NO_EXTRAS = { family: null, classes: {}, cuts: { local: new Set(), found: new Set() } };

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

/** One section: title, the text with numbered citations and the data blocks, or "not written yet". @param {import("./schede.js").Sheet} sheet @param {string} key @param {string} lang @param {string[]} order @param {SheetExtras} x @returns {HTMLElement} */
function sectionView(sheet, key, lang, order, x) {
  const box = el("section", { class: "sheet-section", "data-section": key, "aria-labelledby": `sh-${key}` }, [el("h3", { id: `sh-${key}` }, [TITLES[key]()])]);
  const nodes = sectionNodes(sheet, key, lang, order, x);
  if (!nodes.length) box.append(el("p", { class: "empty", "data-empty": "1" }, [t("sheets.empty")]));
  box.append(...nodes);
  return box;
}

/** The whole sheet: version line, the thirteen sections, the numbered sources. @param {import("./schede.js").Sheet} sheet @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @param {SheetExtras} [extras] @returns {HTMLElement} */
export function buildSheetView(sheet, sources, lang, extras = NO_EXTRAS) {
  const root = el("div", { class: "substance-sheet", "data-substance": sheet.id }, []);
  const written = writtenCount(sheet, SECTIONS, lang);
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(sheet.version), written: formatNumber(written), total: formatNumber(SECTIONS.length) })]));
  /** @type {string[]} */
  const order = [];
  for (const key of SECTIONS) root.append(sectionView(sheet, key, lang, order, extras));
  const list = sourcesList(order, sources);
  if (list) root.append(list);
  return root;
}

/** The sheet of a family: the sections a family holds, the interactions as a table and the numbered sources. @param {import("./schede.js").FamilySheet} family @param {Record<string, import("./schede.js").Source>} sources @param {string} lang @param {Record<string, { names: Record<string, string> }>} classes @returns {HTMLElement} */
export function buildFamilyView(family, sources, lang, classes) {
  const root = el("div", { class: "substance-sheet family-sheet", "data-family": family.id }, []);
  const written = writtenCount(family, FAMILY_SECTIONS, lang);
  root.append(el("p", { class: "note" }, [t("sheets.version", { version: formatNumber(family.version), written: formatNumber(written), total: formatNumber(FAMILY_SECTIONS.length) })]));
  /** @type {string[]} */
  const order = [];
  for (const key of FAMILY_SECTIONS) {
    const box = el("section", { class: "sheet-section", "data-section": key, "aria-labelledby": `sh-${key}` }, [el("h3", { id: `sh-${key}` }, [TITLES[key]()])]);
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

/** Opens the sheet of a substance as a tab next to the files' (the one already open gets the focus); past the limit it opens nothing and says so. @param {string} id @param {string} fallbackName @param {import("./schede_tagli.js").CutContext} [cuts] */
export async function openSheet(id, fallbackName, cuts = NO_EXTRAS.cuts) {
  const s = getState();
  const known = s.tabs.some((x) => x.id === `sheet-${id}`);
  if (!known && !canOpenSheet(s)) {
    const notice = { key: "err.tabs.sheets_limit", params: { max: String(SHEETS_MAX) } };
    update({ tabNotice: notice });
    const live = document.getElementById("status");
    if (live) live.textContent = t(notice.key, notice.params);
    return;
  }
  document.dispatchEvent(new CustomEvent("sheet-opened", { detail: `sheet-${id}` }));
  update({ ...openSheetPatch(s, { id, name: fallbackName, cuts }), tabNotice: null });
}
