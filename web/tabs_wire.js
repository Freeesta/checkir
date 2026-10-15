// @ts-check
import { closeFile } from "./files.js";
import { t } from "./i18n.js";
import { getState, update } from "./state.js";
import { kindOf } from "./tab_kinds.js";
import { endSplitPatch, PANES_MAX, splitPatch, unsplitPatch } from "./panes.js";
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

/** @param {import("./panes.js").Side} side @param {string} code @returns {string} */
function doneText(side, code) {
  if (side === "left") return t("tabs.split.done.left", { code });
  if (side === "right") return t("tabs.split.done.right", { code });
  if (side === "top") return t("tabs.split.done.top", { code });
  if (side === "bottom") return t("tabs.split.done.bottom", { code });
  return t("tabs.split.done.center", { code });
}

/**
 * The actions of the side-by-side view: put a tab beside another, take it away, end the view, its layout and the link of the x axis. Each says what happened.
 * @param {(text: string) => void} announce
 */
export function splitActions(announce) {
  /** @param {string} id @returns {string} */
  const codeOf = (id) => {
    const s = getState();
    const tab = s.tabs.find((x) => x.id === id);
    return tab ? kindOf(tab).label(tab, s).code : id;
  };
  return {
    splitTab: (/** @type {string} */ id, /** @type {import("./panes.js").Side} */ side, /** @type {string | undefined} */ target) => {
      const s = getState();
      const patch = splitPatch(s, id, side, target);
      if (!patch.split) return;
      const added = patch.split.panes.find((p) => !s.split.panes.includes(p) && p !== s.focusTab) ?? id;
      update({ ...patch, tabNotice: null });
      const replaced = s.split.panes.length >= PANES_MAX && !s.split.panes.includes(added);
      announce(doneText(replaced ? "center" : side, codeOf(added)));
    },
    unsplitTab: (/** @type {string} */ id) => {
      const patch = unsplitPatch(getState(), id);
      if (!patch.split) return;
      update(patch);
      announce(t("tabs.split.done.removed", { code: codeOf(id) }));
    },
    endSplit: () => {
      update(endSplitPatch(getState()));
      announce(t("tabs.split.done.ended"));
    },
    setSplitOrientation: (/** @type {"row" | "column"} */ orientation) => update({ split: { ...getState().split, orientation } }),
    setSplitLinked: (/** @type {boolean} */ linked) => {
      update({ split: { ...getState().split, linked } });
      announce(linked ? t("tabs.split.link_on") : t("tabs.split.link_off"));
    },
  };
}
