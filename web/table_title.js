// @ts-check
import { formatNumber, t } from "./i18n.js";

/**
 * The title of the closed data table: its name and the number of rows of the visible range. The table stays in the page (it is the
 * text version of the chart) but folded; the count follows every redraw of the table.
 * @param {HTMLElement} section the `<details>`
 * @param {HTMLElement} table the host the chart fills
 * @returns {{ refresh: () => void }}
 */
export function buildTableTitle(section, table) {
  const title = /** @type {HTMLElement} */ (section.querySelector("summary"));
  const refresh = () => {
    const rows = table.querySelector("table")?.querySelectorAll("tbody tr").length ?? 0;
    const text = rows ? t("table.summary", { n: formatNumber(rows) }) : t("table.title");
    if (title.textContent !== text) title.textContent = text;
  };
  new MutationObserver(refresh).observe(table, { childList: true, subtree: true });
  return { refresh };
}
