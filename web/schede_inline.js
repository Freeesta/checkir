// @ts-check
// The brief sheet inside the results: the sheet of the substance the choice names (level 1–3), one per component at level 4, none at level 5.
// It shows what the sheet holds, section by section, for two audiences (chemist, counsellor); texts are the sheet's own.
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { loadSheet, loadSources, SECTIONS, sectionStatus, sheetIdFor, writtenCount } from "./schede.js";
import { counsellingPoints, sourcesList } from "./schede_dati.js";
import { cutContext } from "./schede_tagli.js";
import { loadExtras, openSheet, sectionNodes, TITLES } from "./schede_ui.js";
import { readPref, writePref } from "./state.js";

/** Sections each audience reads first. */
const AUDIENCES = {
  chemist: ["molecule", "category", "metabolism", "cuts"],
  counsellor: ["effects", "doses", "risks", "interactions", "counselling"],
};

/** @type {"chemist" | "counsellor"} */
let audience = readPref("sheetAudience") === "counsellor" ? "counsellor" : "chemist";

/** Sheets already announced for a spectrum (once per code and sheet, however often the results are drawn). @type {Set<string>} */
const announced = new Set();

/** @param {string} text */
function say(text) {
  const live = document.getElementById("status");
  if (live) live.textContent = text;
}

/** The sheet a candidate hooks to, by its library row (or, without one, what the candidate itself carries). @param {any} c @returns {string | null} */
export function sheetOfCandidate(c) {
  const row = libraryRows(c.library)?.find((r) => r.id === (c.spectrum_id ?? c.id));
  return sheetIdFor(row ?? { substance: c.substance ?? undefined, names: { en: c.display_name ?? c.name } });
}

/** @param {import("./schede.js").Sheet} sheet @param {string} lang @returns {string} */
const writtenText = (sheet, lang) => t("sheets.written_count", { written: formatNumber(writtenCount(sheet, SECTIONS, lang)), total: formatNumber(SECTIONS.length) });

/** The two audiences as a pair of toggle buttons. @param {() => void} redraw @returns {HTMLElement} */
function audienceToggle(redraw) {
  const group = el("div", { class: "audience-toggle", role: "group", "aria-label": t("sheets.audience") });
  /** @type {Array<["chemist" | "counsellor", string]>} */
  const kinds = [["chemist", t("sheets.audience.chemist")], ["counsellor", t("sheets.audience.counsellor")]];
  for (const [kind, label] of kinds) {
    const b = el("button", { type: "button", class: "btn", "data-audience": kind, "data-fk": `audience-${kind}`, "aria-pressed": String(audience === kind) }, [label]);
    b.addEventListener("click", () => {
      audience = kind;
      writePref("sheetAudience", kind);
      for (const other of group.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === b));
      redraw();
    });
    group.append(b);
  }
  return group;
}

/** The sections of the audience that have something to show. @param {import("./schede.js").Sheet} sheet @param {string} lang @param {import("./schede_ui.js").SheetExtras} x @param {Record<string, import("./schede.js").Source>} sources @returns {HTMLElement} */
function sectionsFor(sheet, lang, x, sources) {
  const body = el("div", { class: "inline-sections", "data-audience-body": audience });
  /** @type {string[]} */
  const order = [];
  for (const key of AUDIENCES[audience]) {
    const nodes = sectionNodes(sheet, key, lang, order, x);
    if (!nodes.length) continue;
    body.append(el("section", { class: "inline-section", "data-section": key }, [el("h4", {}, [TITLES[key]()]), ...nodes]));
  }
  if (!body.childElementCount) body.append(el("p", { class: "empty", "data-empty": "1" }, [t("sheets.inline_empty")]));
  const list = sourcesList(order, sources);
  if (list) body.append(list);
  return body;
}

/** @param {string} id @param {string} name @param {number} level @param {() => HTMLElement} badge @param {string} lang @param {any[]} found @param {string[]} libraries @param {string} code @returns {HTMLElement} */
function panelOf(id, name, level, badge, lang, found, libraries, code) {
  const box = el("div", { class: "inline-panel", "data-sheet": id }, [el("p", { class: "busy", role: "status" }, [t("sheets.loading")])]);
  Promise.all([loadSheet(id), loadSources()]).then(async ([sheet, sources]) => {
    if (!sheet) return box.replaceChildren(el("p", { class: "empty", "data-no-sheet": "1" }, [t("sheets.none")]));
    const cuts = cutContext(libraries, found);
    const x = await loadExtras(sheet, cuts);
    const shown = sheet.names[lang] ?? sheet.names.en ?? name;
    const holder = el("div", {});
    const redraw = () => holder.replaceChildren(sectionsFor(sheet, lang, x, sources));
    redraw();
    const full = el("button", { type: "button", class: "btn", "data-fk": "inline-open-sheet" }, [t("sheets.open")]);
    full.addEventListener("click", () => void openSheet(id, name, cuts));
    box.replaceChildren(el("p", { class: "inline-head" }, [el("strong", {}, [t("sheets.of", { name: shown })]), " ", badge(), el("span", { class: "note" }, [` · ${writtenText(sheet, lang)}`])]), audienceToggle(redraw), holder, full);
    const mark = `${code}/${id}`;
    if (!announced.has(mark)) {
      announced.add(mark);
      say(t("sheets.available", { name: shown }));
    }
  });
  return box;
}

/** Tabs of the components at level 4: arrows move between them. @param {Array<{ id: string, name: string, panel: HTMLElement }>} items @returns {HTMLElement} */
function tabs(items) {
  const list = el("div", { role: "tablist", class: "inline-tabs", "aria-label": t("sheets.components") });
  const buttons = items.map((it, i) => el("button", { type: "button", role: "tab", class: "btn", id: `inline-tab-${it.id}`, "aria-controls": `inline-pane-${it.id}`, "aria-selected": String(i === 0), tabindex: i === 0 ? "0" : "-1", "data-fk": `inline-tab-${it.id}` }, [it.name]));
  const select = (/** @type {number} */ at) => {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === at));
      b.tabIndex = i === at ? 0 : -1;
      items[i].panel.hidden = i !== at;
    });
    buttons[at].focus();
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      select((i + step + items.length) % items.length);
    });
  });
  list.append(...buttons);
  items.forEach((it, i) => {
    it.panel.setAttribute("role", "tabpanel");
    it.panel.id = `inline-pane-${it.id}`;
    it.panel.setAttribute("aria-labelledby", `inline-tab-${it.id}`);
    it.panel.hidden = i !== 0;
  });
  return list;
}

/**
 * The brief sheet for the substances a choice names. Null when there is nothing to show: level 5, no hook, or the index of sheets is not read yet.
 * @param {{ cands: any[], level: number, nameOf: (c: any) => string, badge: () => HTMLElement, found: any[], libraries: string[], code: string, lang: string }} p
 * @returns {HTMLElement | null}
 */
export function inlineSheet(p) {
  if (p.level === 5) return null;
  /** @type {Array<{ id: string, name: string, panel: HTMLElement }>} */
  const items = [];
  for (const c of p.level <= 3 ? p.cands.slice(0, 1) : p.cands) {
    const id = sheetOfCandidate(c);
    if (!id || items.some((i) => i.id === id)) continue;
    const name = p.nameOf(c);
    items.push({ id, name, panel: panelOf(id, name, p.level, p.badge, p.lang, p.found, p.libraries, p.code) });
  }
  if (!items.length) return null;
  const box = el("section", { class: "inline-sheet", "data-part": "inline-sheet", "aria-label": t("sheets.inline") });
  if (items.length > 1) box.append(tabs(items));
  box.append(...items.map((i) => i.panel));
  return box;
}

/**
 * The counselling points of the sheet(s) the choice names, for the talk-mode sheet (big letters, no source numbers or signing states: those stay in the chemist's view).
 * Filled when the sheets are read; empty (and hidden) when the choice has no sheet or the sheet has no counselling text yet.
 * @param {{ cands: any[], level: number, lang: string }} p @returns {HTMLElement | null}
 */
export function talkCounselling(p) {
  if (p.level === 5) return null;
  const ids = [...new Set((p.level <= 3 ? p.cands.slice(0, 1) : p.cands).map(sheetOfCandidate).filter((x) => x !== null))];
  if (!ids.length) return null;
  const box = el("section", { class: "sheet-block sheet-counselling", "data-block": "counselling", hidden: "" }, [el("h3", {}, [TITLES.counselling()])]);
  Promise.all(ids.map((id) => loadSheet(id))).then((sheets) => {
    for (const sheet of sheets) {
      const text = sheet?.texts[p.lang]?.counselling ?? sheet?.texts.en?.counselling ?? "";
      if (!sheet || !text || sectionStatus(sheet, "counselling", p.lang) === "empty") continue;
      const name = sheet.names[p.lang] ?? sheet.names.en ?? sheet.id;
      box.append(el("h4", {}, [name]), ...counsellingPoints(sheet, text, []).map((x) => stripRefs(x)));
    }
    box.hidden = box.childElementCount < 2;
  });
  return box;
}

/** Talk mode shows no source numbers. @param {HTMLElement} node @returns {HTMLElement} */
function stripRefs(node) {
  for (const r of node.querySelectorAll(".ref")) r.remove();
  return node;
}
