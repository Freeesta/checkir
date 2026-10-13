// @ts-check
// The glossary view: every term of the chapters with a one-line definition, searchable, each entry reachable as `#g-<id>`.
import { el } from "../dom.js";
import { t } from "../i18n.js";

/** @typedef {import("./content.js").Entry} Entry */

/** Lower case without accents, for the search. @param {string} s */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * @param {HTMLElement} host
 * @param {Entry[]} entries sorted for the language by the caller
 * @param {string | null} focusId entry to scroll to
 * @returns {HTMLElement} what to focus after a navigation: the entry, or the heading
 */
export function renderGlossary(host, entries, focusId) {
  const title = el("h2", { id: "view-title", tabindex: "-1" }, [t("teoria.glossary.title")]);
  const input = el("input", { type: "search", id: "glossary-search", autocomplete: "off" });
  const count = el("p", { class: "hint", role: "status", "aria-live": "polite" });
  const list = el("dl", { class: "glossary" });
  const byId = new Map(entries.map((e) => [e.id, e]));
  const nodes = entries.map((e) => {
    const see = e.see_also.filter((id) => byId.has(id));
    const dd = el("dd", {}, [e.definition]);
    if (see.length) {
      dd.append(" ", el("span", { class: "see" }, [`${t("teoria.glossary.see")} `]));
      see.forEach((id, i) => dd.append(...(i ? [", "] : []), el("a", { href: `#g-${id}` }, [byId.get(id)?.term ?? id])));
    }
    const dt = el("dt", { id: `g-${e.id}`, tabindex: "-1" }, [e.term, " ", el("span", { class: "other-lang", lang: document.documentElement.lang === "it" ? "en" : "it" }, [`(${e.term_other_lang})`])]);
    const group = el("div", { class: "entry" }, [dt, dd]);
    list.append(group);
    return { group, text: fold(`${e.term} ${e.term_other_lang} ${e.definition}`) };
  });
  const filter = () => {
    const q = fold(input.value.trim());
    let shown = 0;
    for (const n of nodes) {
      const ok = !q || n.text.includes(q);
      n.group.hidden = !ok;
      if (ok) shown += 1;
    }
    count.textContent = t("teoria.glossary.count", { shown: String(shown), total: String(nodes.length) });
  };
  input.addEventListener("input", filter);
  host.replaceChildren(title, el("p", {}, [t("teoria.glossary.intro")]), el("label", { for: "glossary-search" }, [t("teoria.glossary.search")]), input, count, list);
  filter();
  const target = focusId ? document.getElementById(`g-${focusId}`) : null;
  if (!target) return title;
  target.classList.add("target");
  return target;
}
