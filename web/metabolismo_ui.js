// @ts-check
// The metabolism of a sheet as data: a tree parent → metabolites (reaction and enzymes on each step), always beside the same facts as tables, and the half-life as a range.
// Names of reactions and columns are words of the interface; the facts come from the sheet.
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { cite, scrollBox } from "./schede_dati.js";

/** Kinds of reaction (literal keys, so the catalog check can see them). @type {Record<string, () => string>} */
const REACTIONS = {
  n_demethylation: () => t("sheets.metabolism.reaction.n_demethylation"),
  o_demethylation: () => t("sheets.metabolism.reaction.o_demethylation"),
  hydrolysis_ester: () => t("sheets.metabolism.reaction.hydrolysis_ester"),
  hydroxylation: () => t("sheets.metabolism.reaction.hydroxylation"),
  glucuronidation: () => t("sheets.metabolism.reaction.glucuronidation"),
  sulfation: () => t("sheets.metabolism.reaction.sulfation"),
  deamination: () => t("sheets.metabolism.reaction.deamination"),
  reduction_keto: () => t("sheets.metabolism.reaction.reduction_keto"),
  other: () => t("sheets.metabolism.reaction.other"),
};

/** @typedef {{ from: string, to: string, reaction: string, enzymes?: string[], source: string }} Pathway */

/** @param {string} s @returns {string} letters and digits only, for comparing ids written with different separators */
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** @param {string} s @returns {string} */
const words = (s) => s.replace(/[._+-]+/g, " ");

/** @param {Pathway} p @returns {string} reaction and enzymes of a step */
function stepLabel(p) {
  const reaction = (REACTIONS[p.reaction] ?? REACTIONS.other)();
  return p.enzymes?.length ? `${reaction} · ${p.enzymes.join(", ")}` : reaction;
}

/** The steps that start from a node, as a nested list. @param {Pathway[]} all @param {string} from @param {string[]} order @param {Set<string>} seen @returns {HTMLElement | null} */
function branch(all, from, order, seen) {
  const steps = all.filter((p) => squash(p.from) === squash(from) && !seen.has(p.to));
  if (!steps.length) return null;
  const list = el("ul", { class: "metabolism-tree" });
  for (const p of steps) {
    seen.add(p.to);
    const item = el("li", { "data-metabolite": p.to }, [el("span", { class: "tree-step" }, [`→ ${words(p.to)} (${stepLabel(p)}) `]), cite(order, p.source)]);
    const below = branch(all, p.to, order, seen);
    if (below) item.append(below);
    list.append(item);
  }
  return list;
}

/** The tree: the parent substance at the root, then each step. Combinations such as «parent+ethanol» start their own branch. @param {Pathway[]} pathways @param {string[]} order @param {string} parentName @returns {HTMLElement} */
function tree(pathways, order, parentName) {
  const seen = new Set();
  const root = el("div", { class: "metabolism-root", "data-part": "metabolism-tree", role: "group", "aria-label": t("sheets.metabolism.tree") }, [el("p", { class: "tree-parent" }, [parentName])]);
  const first = branch(pathways, "parent", order, seen);
  if (first) root.append(first);
  for (const start of new Set(pathways.map((p) => p.from).filter((f) => squash(f) !== "parent" && !pathways.some((p) => squash(p.to) === squash(f))))) {
    const extra = branch(pathways, start, order, seen);
    if (extra) root.append(el("p", { class: "tree-parent" }, [words(start)]), extra);
  }
  return root;
}

/** @param {Pathway[]} pathways @param {string[]} order @returns {HTMLElement} */
function pathwayTable(pathways, order) {
  const head = el("tr", {}, [t("sheets.metabolism.col.from"), t("sheets.metabolism.col.to"), t("sheets.metabolism.col.reaction"), t("sheets.metabolism.col.enzymes"), t("sheets.metabolism.col.source")].map((k) => el("th", { scope: "col" }, [k])));
  const rows = pathways.map((p) => el("tr", {}, [
    el("td", {}, [squash(p.from) === "parent" ? t("sheets.metabolism.parent") : words(p.from)]),
    el("th", { scope: "row" }, [words(p.to)]),
    el("td", {}, [(REACTIONS[p.reaction] ?? REACTIONS.other)()]),
    el("td", {}, [p.enzymes?.join(", ") ?? ""]),
    el("td", {}, [cite(order, p.source)]),
  ]));
  return el("table", { class: "data-table", "data-part": "metabolism-pathways" }, [el("caption", {}, [t("sheets.metabolism.caption_pathways")]), el("thead", {}, [head]), el("tbody", {}, rows)]);
}

/** @param {any[]} metabolites @param {Pathway[]} pathways @param {string[]} order @returns {HTMLElement} */
function metaboliteTable(metabolites, pathways, order) {
  const head = el("tr", {}, [t("sheets.metabolism.col.metabolite"), t("sheets.metabolism.col.active"), t("sheets.metabolism.col.marker"), t("sheets.metabolism.col.source")].map((k) => el("th", { scope: "col" }, [k])));
  /** @param {boolean | null} v */
  const activeWord = (v) => (v === true ? t("sheets.metabolism.active.yes") : v === false ? t("sheets.metabolism.active.no") : t("sheets.metabolism.active.unknown"));
  const rows = metabolites.map((m) => {
    const named = pathways.find((p) => squash(p.to) === squash(m.name_key));
    return el("tr", { "data-metabolite": m.name_key }, [
      el("th", { scope: "row" }, [words(named?.to ?? m.name_key)]),
      el("td", {}, [activeWord(m.active)]),
      el("td", {}, [m.marker ? t("sheets.metabolism.marker_yes") : ""]),
      el("td", {}, [cite(order, m.source)]),
    ]);
  });
  return el("table", { class: "data-table", "data-part": "metabolism-metabolites" }, [el("caption", {}, [t("sheets.metabolism.caption_metabolites")]), el("thead", {}, [head]), el("tbody", {}, rows)]);
}

/** @param {any} h @param {string[]} order @returns {HTMLElement} */
function halfLife(h, order) {
  const range = h.min === h.max ? formatNumber(h.min, 1) : `${formatNumber(h.min, 1)}–${formatNumber(h.max, 1)}`;
  const where = [h.matrix, h.route].filter(Boolean).map(words).join(", ");
  return el("p", { class: "half-life", "data-part": "half-life" }, [t("sheets.metabolism.half_life", { range, where }), " ", cite(order, h.source)]);
}

/** The metabolism block of a sheet; null when the sheet has none. @param {any} metabolism @param {string[]} order @param {string} parentName @returns {HTMLElement | null} */
export function metabolismBlock(metabolism, order, parentName) {
  if (!metabolism) return null;
  /** @type {Pathway[]} */
  const pathways = metabolism.pathways ?? [];
  const box = el("div", { class: "sheet-metabolism", "data-part": "metabolism" });
  if (pathways.length) box.append(tree(pathways, order, parentName), scrollBox(pathwayTable(pathways, order)));
  if (metabolism.metabolites?.length) box.append(scrollBox(metaboliteTable(metabolism.metabolites, pathways, order)));
  if (metabolism.half_life_h) box.append(halfLife(metabolism.half_life_h, order));
  return box.childElementCount ? box : null;
}
