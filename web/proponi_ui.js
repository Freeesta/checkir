// @ts-check
// The inline editor of one sheet section: current text, preview, local checks, and a link that opens GitHub only on the user's click.
import { el } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { parseParagraphs } from "./schede.js";
import { buildIssueUrl, checkProposal } from "./proponi.js";

/** Error messages (literal keys, so the catalog check can see them). @type {Record<string, (p: Record<string, string>) => string>} */
const ERRORS = {
  "propose.err.empty": () => t("propose.err.empty"),
  "propose.err.unchanged": () => t("propose.err.unchanged"),
  "propose.err.too_long": (p) => t("propose.err.too_long", p),
  "propose.err.banned": (p) => t("propose.err.banned", p),
  "propose.err.contact": () => t("propose.err.contact"),
  "propose.err.sources_invalid": (p) => t("propose.err.sources_invalid", p),
  "propose.err.no_source": (p) => t("propose.err.no_source", p),
};

/** @param {string} id @param {string} label @param {HTMLElement} control @returns {HTMLElement} */
function field(id, label, control) {
  control.id = id;
  return el("div", { class: "propose-field" }, [el("label", { for: id }, [label]), control]);
}

/**
 * The editor of one section, ready to be appended; the draft lives only in memory.
 * @param {{ id: string, version: number }} sheet @param {string} key @param {string} lang @param {string} current text now on the sheet @param {Set<string>} known source ids
 * @returns {HTMLElement}
 */
export function buildProposer(sheet, key, lang, current, known) {
  const uid = `pr-${key}`;
  const text = /** @type {HTMLTextAreaElement} */ (el("textarea", { rows: "8", spellcheck: "false" }));
  text.value = current;
  const sources = /** @type {HTMLTextAreaElement} */ (el("textarea", { rows: "3", spellcheck: "false" }));
  const name = /** @type {HTMLInputElement} */ (el("input", { type: "text", autocomplete: "off" }));
  const preview = el("div", { class: "propose-preview", "data-propose": "preview" });
  const problems = el("ul", { class: "propose-problems", "data-propose": "problems", role: "status" });
  const paste = el("p", { class: "note", "data-propose": "paste", hidden: "" }, [t("propose.paste")]);
  const link = el("a", { class: "propose-open", "data-fk": "propose-open", target: "_blank", rel: "noopener noreferrer", "aria-disabled": "true" }, [t("propose.open")]);
  let pasted = false;
  const refresh = () => {
    const list = checkProposal({ section: key, lang, text: text.value, current, sources: sources.value, known });
    problems.replaceChildren(...list.map((p) => el("li", { "data-error": p.key }, [ERRORS[p.key](p.params ?? {})])));
    const order = /** @type {string[]} */ ([]);
    preview.replaceChildren(...parseParagraphs(text.value, order).map((parts) => el("p", {}, parts.map((x) => ("ref" in x ? el("sup", { class: "ref" }, [`[${formatNumber(x.n)}]`]) : x.text)))));
    if (list.length) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      pasted = false;
    } else {
      const built = buildIssueUrl({ id: sheet.id, section: key, lang, version: sheet.version, text: text.value, sources: sources.value, name: name.value });
      link.setAttribute("href", built.url);
      link.removeAttribute("aria-disabled");
      pasted = built.pasted;
    }
    paste.hidden = !pasted;
  };
  link.addEventListener("click", (e) => {
    if (link.getAttribute("aria-disabled") === "true") return e.preventDefault();
    if (pasted) navigator.clipboard?.writeText(text.value.trim()).catch(() => {});
  });
  for (const c of [text, sources, name]) c.addEventListener("input", refresh);
  refresh();
  return el("div", { class: "propose", "data-propose": key }, [
    field(`${uid}-text`, t("propose.text"), text),
    field(`${uid}-sources`, t("propose.sources"), sources),
    field(`${uid}-name`, t("propose.name"), name),
    el("h4", {}, [t("propose.preview")]),
    preview,
    problems,
    paste,
    link,
  ]);
}
