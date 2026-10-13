// @ts-check
import { el } from "./dom.js";
import { t } from "./i18n.js";

/**
 * The short box of warnings that sits next to every result (wording reviewed with the full page "Avvertenze").
 * Built once; `refresh` rewrites the texts when the language changes.
 * @param {HTMLElement} host the element that becomes the box
 * @param {{ href?: string }} [options] `href` of the full page; without it the box shows no link (the full page itself)
 * @returns {{ refresh: () => void }}
 */
export function buildWarningsBox(host, options = {}) {
  host.classList.add("warnings-box");
  host.setAttribute("role", "note");
  const text = el("p");
  const link = options.href ? el("a", { href: options.href }) : null;
  host.replaceChildren(text, ...(link ? [link] : []));
  return {
    refresh() {
      host.setAttribute("aria-label", t("warnings.box_label"));
      text.textContent = t("warnings.short");
      if (link) link.textContent = t("warnings.more");
    },
  };
}
