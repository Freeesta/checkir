// @ts-check

import { renderSheetTab } from "./sheet_tab.js";

/**
 * Kinds of tab, a static registry: a new kind is one row. `panel` is the id of the pane that shows it, `label` the text of the tab (the code and, for a file, the file name),
 * `render` fills the pane of a kind that is not the main one.
 * @typedef {{ kind: "file" | "sheet", icon: string, nameKey: string, panel: string, label: (tab: import("./state.js").Tab, s: import("./state.js").AppState) => { code: string, name: string }, render?: (host: HTMLElement, tab: import("./state.js").Tab) => Promise<void> }} TabKind
 */

/** @type {TabKind[]} */
export const TAB_KINDS = [
  {
    kind: "file",
    icon: "file",
    nameKey: "tabs.kind.file",
    panel: "pane-main",
    label: (tab, s) => {
      const f = s.files.find((x) => x.code === tab.code);
      return { code: tab.code ?? "", name: f?.name ?? "" };
    },
  },
  { kind: "sheet", icon: "sheet", nameKey: "tabs.kind.sheet", panel: "sheet-pane", label: (tab) => ({ code: tab.sheet?.name ?? "", name: tab.sheet?.name ?? "" }), render: renderSheetTab },
];

/** @param {import("./state.js").Tab} tab @returns {TabKind} */
export function kindOf(tab) {
  return TAB_KINDS.find((k) => k.kind === tab.kind) ?? TAB_KINDS[0];
}
