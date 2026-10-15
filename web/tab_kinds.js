// @ts-check

/**
 * Kinds of tab, a static registry: a new kind is one row. `panel` is the id of the pane that shows it, `label` the text of the tab (the code and, for a file, the file name).
 * @typedef {{ kind: "file" | "sheet", icon: string, nameKey: string, panel: string, label: (tab: import("./state.js").Tab, s: import("./state.js").AppState) => { code: string, name: string } }} TabKind
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
];

/** @param {import("./state.js").Tab} tab @returns {TabKind} */
export function kindOf(tab) {
  return TAB_KINDS.find((k) => k.kind === tab.kind) ?? TAB_KINDS[0];
}
