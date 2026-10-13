// @ts-check
// The structured data of a sheet, as plain blocks: identity with copyable fields, the drawing of the molecule, origin, the table of the cuts, the topic of a counselling point.
// Labels are words of the interface; nothing here writes a statement about a substance (the texts are the sheet's own).
import { APP_NAME } from "./appname.js";
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { parseParagraphs, sectionStatus, sectionText, sheetIndex } from "./schede.js";
import { cutStatus } from "./schede_tagli.js";

/** Base of a DOI link, opened only on the user's click. */
const DOI = "https://doi.org/";

/** @param {import("./schede.js").Source} s @returns {Array<Node | string>} */
export function sourceLine(s) {
  const text = s.year ? `${s.title} (${s.year})` : s.title;
  const href = s.doi ? DOI + s.doi : s.url;
  if (!href || !href.startsWith("https:")) return [text];
  return [text, " ", el("a", { href, target: "_blank", rel: "noopener noreferrer" }, [t("sheets.open_source")])];
}

/** The numbered sources, in order of first use; null when nothing was cited. @param {string[]} order @param {Record<string, import("./schede.js").Source>} sources @returns {HTMLElement | null} */
export function sourcesList(order, sources) {
  if (!order.length) return null;
  const list = el("ol", { class: "sheet-sources", "aria-label": t("sheets.sources_list") });
  for (const id of order) list.append(el("li", { "data-source": id }, sources[id] ? sourceLine(sources[id]) : [id]));
  return list;
}

/** The text of a section as paragraphs with numbered citations. @param {string} text @param {string[]} order @returns {HTMLElement[]} */
export function paragraphs(text, order) {
  return parseParagraphs(text, order).map((parts) => el("p", {}, parts.map((p) => ("ref" in p ? el("sup", { class: "ref" }, [`[${formatNumber(p.n)}]`]) : p.text))));
}

/**
 * The text of a section: the sheet's own, or (for the sections a family sheet holds) the family's when the sheet's own is still empty.
 * @param {import("./schede.js").Sheet} sheet @param {import("./schede.js").FamilySheet | null} family @param {string} key @param {string} lang
 * @returns {{ text: string, fromFamily: boolean }}
 */
export function effectiveText(sheet, family, key, lang) {
  if (sectionStatus(sheet, key, lang) === "shown") return { text: sectionText(sheet, key, lang), fromFamily: false };
  if (family && sectionStatus(family, key, lang) === "shown") return { text: sectionText(family, key, lang), fromFamily: true };
  return { text: "", fromFamily: false };
}

/** Numbered citation of a source, in order of first use. @param {string[]} order @param {string} id @returns {HTMLElement} */
export function cite(order, id) {
  if (!order.includes(id)) order.push(id);
  return el("sup", { class: "ref" }, [`[${formatNumber(order.indexOf(id) + 1)}]`]);
}

/** Topics of a counselling point (literal keys, so the catalog check can see them). @type {Record<string, () => string>} */
export const TOPICS = {
  set_setting: () => t("sheets.topic.set_setting"),
  dosing: () => t("sheets.topic.dosing"),
  redosing: () => t("sheets.topic.redosing"),
  route: () => t("sheets.topic.route"),
  combination: () => t("sheets.topic.combination"),
  overdose_signs: () => t("sheets.topic.overdose_signs"),
  tolerance: () => t("sheets.topic.tolerance"),
  dependence: () => t("sheets.topic.dependence"),
  mental_health: () => t("sheets.topic.mental_health"),
  sleep_food_water: () => t("sheets.topic.sleep_food_water"),
  sexual_health: () => t("sheets.topic.sexual_health"),
  legal_status: () => t("sheets.topic.legal_status"),
  testing: () => t("sheets.topic.testing"),
};

/** @type {Record<string, () => string>} */
const FREQUENCY = { common: () => t("sheets.cuts.freq.common"), occasional: () => t("sheets.cuts.freq.occasional"), reported: () => t("sheets.cuts.freq.reported") };
/** @type {Record<string, () => string>} */
const ORIGIN_TYPES = { natural: () => t("sheets.origin.natural"), semisynthetic: () => t("sheets.origin.semisynthetic"), synthetic: () => t("sheets.origin.synthetic") };

/** @param {string} key a lower-case key with dashes or underscores @returns {string} */
function words(key) {
  return key.replace(/[._-]+/g, " ");
}

/** A value with a button that copies it (clipboard from the page's own memory; a failed copy says so in the live note). @param {string} label @param {string} value @returns {HTMLElement} */
function copyable(label, value) {
  const note = el("span", { class: "copy-note", role: "status" });
  const button = el("button", { type: "button", class: "btn copy-btn", "data-fk": `copy-${label}`, "aria-label": t("sheets.copy_label", { what: label }) }, [t("sheets.copy")]);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      note.textContent = t("status.copied");
    } catch {
      note.textContent = t("status.copy_failed");
    }
  });
  return el("span", { class: "copyable" }, [el("code", {}, [value]), " ", button, note]);
}

/** Formula, mass, SMILES and InChIKey (copyable), IUPAC name and CAS number. @param {import("./schede.js").Sheet} sheet @returns {HTMLElement | null} */
export function identityBlock(sheet) {
  const i = sheet.identity;
  if (!i) return null;
  const list = el("dl", { class: "numbers sheet-identity", "data-part": "identity" });
  /** @param {string} label @param {Array<Node | string>} value */
  const row = (label, value) => list.append(el("dt", {}, [label]), el("dd", {}, value));
  if (i.formula) row(t("sheets.identity.formula"), [i.formula]);
  if (i.molar_mass_g_mol) row(t("sheets.identity.mass"), [t("sheets.identity.mass_value", { n: formatNumber(i.molar_mass_g_mol, 2) })]);
  if (i.smiles) row("SMILES", [copyable("SMILES", i.smiles)]);
  if (i.inchikey) row("InChIKey", [copyable("InChIKey", i.inchikey)]);
  if (i.cas) row("CAS", [i.cas]);
  return list.childElementCount ? list : null;
}

/** Elements a drawing of a molecule may contain; anything else is dropped. */
const SVG_OK = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc"]);

/** @param {Element} node */
function clean(node) {
  for (const a of [...node.attributes]) if (/^on/i.test(a.name) || /href|style/i.test(a.name) || /url\(|javascript:/i.test(a.value)) node.removeAttribute(a.name);
  for (const child of [...node.children]) {
    if (SVG_OK.has(child.localName)) clean(child);
    else child.remove();
  }
}

/** The drawing of the build (own file, drawn in `currentColor`) as an inline SVG without scripts, links or styles; null if it is not an SVG. @param {string} text @returns {SVGElement | null} */
export function safeSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return null;
  clean(root);
  const svg = /** @type {SVGElement} */ (/** @type {unknown} */ (document.importNode(root, true)));
  svg.setAttribute("class", "structure-svg");
  svg.setAttribute("focusable", "false");
  return svg;
}

/** The structure of the molecule, loaded when the block is built; empty (no figure) when the sheet has none or it cannot be read. @param {import("./schede.js").Sheet} sheet @param {string} name @returns {HTMLElement} */
export function structureFigure(sheet, name) {
  const figure = el("figure", { class: "sheet-structure", "data-part": "structure" });
  if (!sheet.structure) return figure;
  fetch(new URL(`schede/${sheet.id}.svg`, import.meta.url))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error("svg"))))
    .then((text) => {
      const svg = safeSvg(text);
      if (!svg) return;
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", t("sheets.structure", { name }));
      figure.append(svg);
    })
    .catch(() => undefined);
  return figure;
}

/** Origin as data: type, classes of precursors, impurities that show in the spectrum. @param {any} origin @param {string[]} order @returns {HTMLElement | null} */
export function originBlock(origin, order) {
  if (!origin) return null;
  const list = el("dl", { class: "numbers", "data-part": "origin" });
  list.append(el("dt", {}, [t("sheets.origin.type")]), el("dd", {}, [(ORIGIN_TYPES[origin.type] ?? (() => origin.type))()]));
  if (origin.precursor_classes?.length) list.append(el("dt", {}, [t("sheets.origin.precursors")]), el("dd", {}, [origin.precursor_classes.map(words).join(", ")]));
  const imps = origin.typical_impurities ?? [];
  if (imps.length) {
    const ul = el("ul", { class: "plain" }, imps.map((/** @type {any} */ x) => el("li", {}, [words(x.substance), x.ir_relevant ? ` · ${t("sheets.origin.ir")}` : "", " ", cite(order, x.source)])));
    list.append(el("dt", {}, [t("sheets.origin.impurities")]), el("dd", {}, [ul]));
  }
  return list;
}

/**
 * The cuts of a sheet with what the program computes for each: a spectrum in a public library, one in an active library of this browser, found in this sample.
 * @param {import("./schede.js").Sheet} sheet @param {string[]} order @param {import("./schede_tagli.js").CutContext} ctx @param {(id: string) => string} nameOf @returns {HTMLElement | null}
 */
export function cutsBlock(sheet, order, ctx, nameOf) {
  if (!sheet.cuts?.length) return null;
  const rows = sheet.cuts.map((c) => {
    const s = cutStatus(c.cut, ctx);
    const marks = [s.found ? t("sheets.cuts.found") : "", s.public || s.local ? t("sheets.cuts.detectable", { app: APP_NAME }) : t("sheets.cuts.not_detectable")].filter(Boolean);
    return el("tr", { "data-cut": c.cut, "data-found": s.found ? "1" : "0", "data-detectable": s.public || s.local ? "1" : "0" }, [
      el("th", { scope: "row" }, [nameOf(c.cut)]),
      el("td", {}, [(FREQUENCY[c.frequency] ?? (() => c.frequency))()]),
      el("td", {}, [marks.join(" · ")]),
      el("td", {}, [cite(order, c.source)]),
    ]);
  });
  const head = el("tr", {}, [t("sheets.cuts.col.cut"), t("sheets.cuts.col.frequency"), t("sheets.cuts.col.detect"), t("sheets.cuts.col.source")].map((k) => el("th", { scope: "col" }, [k])));
  return el("table", { class: "data-table sheet-cuts", "data-part": "cuts" }, [el("caption", {}, [t("sheets.cuts.caption")]), el("thead", {}, [head]), el("tbody", {}, rows)]);
}

/** @type {Record<string, () => string>} */
const SEVERITY = { dangerous: () => t("sheets.severity.dangerous"), risky: () => t("sheets.severity.risky"), caution: () => t("sheets.severity.caution") };
/** @type {Record<string, () => string>} */
const MECHANISM = {
  serotonergic: () => t("sheets.mechanism.serotonergic"),
  cyp_inhibition: () => t("sheets.mechanism.cyp_inhibition"),
  cns_depression: () => t("sheets.mechanism.cns_depression"),
  sympathomimetic: () => t("sheets.mechanism.sympathomimetic"),
  qt: () => t("sheets.mechanism.qt"),
  maoi: () => t("sheets.mechanism.maoi"),
  other: () => t("sheets.mechanism.other"),
};

/** The interactions as data: with what, how severe (a word, never colour alone), by which mechanism. @param {any[] | undefined} list @param {string[]} order @param {(id: string) => string} nameOf @returns {HTMLElement | null} */
export function interactionsBlock(list, order, nameOf) {
  if (!list?.length) return null;
  const head = el("tr", {}, [t("sheets.interactions.col.with"), t("sheets.interactions.col.severity"), t("sheets.interactions.col.mechanism"), t("sheets.interactions.col.source")].map((k) => el("th", { scope: "col" }, [k])));
  const rows = list.map((i) => el("tr", { "data-with": i.with, "data-severity": i.severity }, [
    el("th", { scope: "row" }, [nameOf(i.with)]),
    el("td", {}, [(SEVERITY[i.severity] ?? (() => i.severity))()]),
    el("td", {}, [i.mechanism ? (MECHANISM[i.mechanism] ?? MECHANISM.other)() : ""]),
    el("td", {}, [cite(order, i.source)]),
  ]));
  return el("table", { class: "data-table sheet-interactions", "data-part": "interactions" }, [el("caption", {}, [t("sheets.interactions.caption")]), el("thead", {}, [head]), el("tbody", {}, rows)]);
}

/** The talking points: one paragraph per point in the order of `counselling`, each with its topic. @param {import("./schede.js").Sheet} sheet @param {string} text @param {string[]} order @returns {HTMLElement[]} */
export function counsellingPoints(sheet, text, order) {
  return paragraphs(text, order).map((p, i) => {
    const point = sheet.counselling?.[i];
    p.setAttribute("data-point", point?.key ?? String(i));
    if (point) {
      p.setAttribute("data-topic", point.topic);
      p.prepend(el("span", { class: "topic-tag" }, [(TOPICS[point.topic] ?? (() => point.topic))()]), " ");
    }
    return p;
  });
}

/** The name of a substance or class id in a language: the sheet's name, the class name, else the id as words. @param {string} id @param {string} lang @param {Record<string, { names: Record<string, string> }>} classes @returns {string} */
export function idName(id, lang, classes) {
  const entry = sheetIndex().entries.find((e) => e.id === id);
  const names = entry?.names ?? classes[id]?.names;
  return names?.[lang] ?? names?.en ?? words(id);
}
