// @ts-check
import { formatNumber, t } from "./i18n.js";

/**
 * Copy to the clipboard, from the page's own memory: `copyText` for the menus of the rows, `copyCursor` for the readings at the cursors
 * (wavenumber and absorbance as `x<TAB>y`, one line per cursor, decimal point, ready to paste in a spreadsheet).
 * @param {(text: string) => void} announce @param {{ cursorValues: () => Array<{ x: number, y: number }> }} hooks
 */
export function copyActions(announce, hooks) {
  /** @param {string} text @returns {Promise<boolean>} */
  async function write(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }
  /** @param {string} text */
  async function copyText(text) {
    announce((await write(text)) ? t("status.copied") : t("status.copy_failed"));
  }
  return {
    copyText,
    copyCursor: () => {
      const values = hooks.cursorValues();
      if (!values.length) return announce(t("status.copy_no_cursor"));
      return copyText(values.map((v) => `${formatNumber(v.x, 1)}\t${formatNumber(v.y, 3)}`).join("\n"));
    },
  };
}
