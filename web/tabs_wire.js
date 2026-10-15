// @ts-check
import { closeFile } from "./files.js";
import { t } from "./i18n.js";
import { getState, update } from "./state.js";
import { kindOf } from "./tab_kinds.js";
import { closePatch, focusPatch, movePatch, syncActive } from "./tabs.js";

/**
 * The tab actions of the context: showing, closing and moving tabs. A file tab closes through `closeFile`, which also takes away the derived spectra and their data.
 * @param {(text: string) => void} announce
 */
export function tabActions(announce) {
  /** @param {string} id */
  const closeTab = (id) => {
    const tab = getState().tabs.find((x) => x.id === id);
    if (!tab) return;
    if (tab.kind === "file" && tab.code) {
      closeFile(tab.code);
      announce(t("status.file_closed"));
    } else update(closePatch(getState(), id));
  };
  return {
    focusTab: (/** @type {string} */ id) => update({ ...focusPatch(getState(), id), tabNotice: null }),
    selectFile: (/** @type {string} */ code) => update(syncActive(getState(), code)),
    closeTab,
    closeOtherTabs: (/** @type {string} */ id) => {
      for (const tab of getState().tabs.filter((x) => x.id !== id)) closeTab(tab.id);
    },
    moveTab: (/** @type {string} */ id, /** @type {number} */ to) => {
      const s = getState();
      const tab = s.tabs.find((x) => x.id === id);
      if (!tab || to < 0 || to >= s.tabs.length) return;
      update(movePatch(s, id, to));
      announce(t("status.tab_moved", { name: `${kindOf(tab).label(tab, s).code}`, n: String(to + 1), total: String(s.tabs.length) }));
    },
  };
}
