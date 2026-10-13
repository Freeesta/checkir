// @ts-check
/**
 * Registry of everything the user can do. Header, panel, work-area bar, phone menu and (later) shortcut help are generated from it.
 * `step` orders the guided flow: the "next step" button shows the first enabled action by `step`. `key` is for the shortcuts package.
 * @typedef {{
 *   getState: () => import("./state.js").AppState,
 *   openFile: () => void, loadDemo: () => void, selectFile: (code: string) => void, closeFile: (code: string) => void, setLang: (code: string) => void, toggleLang: () => void, cycleTheme: () => void,
 *   togglePanel: () => void, goto: (panelId: string) => void, openDialog: (id: string) => void,
 * }} Ctx
 * @typedef {{
 *   id: string, labelKey: string, tipKey: string, icon: string, key?: string, section?: string, step?: number,
 *   run: (ctx: Ctx) => void, enabled: (state: import("./state.js").AppState) => boolean,
 * }} Action
 */

const always = () => true;
const never = () => false;

/** @param {number} n @param {string} id @param {string} icon @returns {Action} */
function gotoAction(n, id, icon) {
  return {
    id: `panel.goto.${n}`,
    labelKey: `panel.${id}.title`,
    tipKey: `panel.${id}.tip`,
    icon,
    section: id,
    run: (ctx) => ctx.goto(id),
    enabled: always,
  };
}

/** @type {Action[]} */
export const ACTIONS = [
  { id: "file.open", labelKey: "action.file_open.label", tipKey: "action.file_open.tip", icon: "upload", section: "files", step: 1, run: (c) => c.openFile(), enabled: always },
  { id: "demo.load", labelKey: "action.demo_load.label", tipKey: "action.demo_load.tip", icon: "demo", section: "files", run: (c) => c.loadDemo(), enabled: always },
  { id: "file.close", labelKey: "action.file_close.label", tipKey: "action.file_close.tip", icon: "close", section: "files", run: (c) => { const code = c.getState().active; if (code) c.closeFile(code); }, enabled: (s) => s.files.length > 0 },
  { id: "match.run", labelKey: "action.match_run.label", tipKey: "action.match_run.tip", icon: "compare", section: "results", step: 2, run: () => {}, enabled: (s) => s.files.length > 0 && s.libraries.length > 0 },
  { id: "subtract.open", labelKey: "action.subtract_open.label", tipKey: "action.subtract_open.tip", icon: "subtract", section: "files", step: 3, run: () => {}, enabled: never },
  { id: "sheet.open", labelKey: "action.sheet_open.label", tipKey: "action.sheet_open.tip", icon: "sheet", section: "sheet", step: 4, run: () => {}, enabled: never },
  { id: "panel.toggle", labelKey: "action.panel_toggle.label", tipKey: "action.panel_toggle.tip", icon: "panel-open", run: (c) => c.togglePanel(), enabled: always },
  gotoAction(1, "files", "file"),
  gotoAction(2, "libraries", "library"),
  gotoAction(3, "results", "results"),
  gotoAction(4, "peaks", "peaks"),
  gotoAction(5, "sheet", "sheet"),
  { id: "info.open", labelKey: "action.info_open.label", tipKey: "action.info_open.tip", icon: "info", run: (c) => c.openDialog("info"), enabled: always },
  { id: "help.open", labelKey: "action.help_open.label", tipKey: "action.help_open.tip", icon: "keyboard", run: (c) => c.openDialog("help"), enabled: always },
  { id: "privacy.open", labelKey: "action.privacy_open.label", tipKey: "action.privacy_open.tip", icon: "lock", run: (c) => c.openDialog("info"), enabled: always },
  { id: "lang.toggle", labelKey: "lang.label", tipKey: "action.lang_toggle.tip", icon: "language", run: (c) => c.toggleLang(), enabled: always },
  { id: "theme.cycle", labelKey: "action.theme_cycle.label", tipKey: "action.theme_cycle.tip", icon: "theme-auto", run: (c) => c.cycleTheme(), enabled: always },
];

/** @param {string} id @returns {Action} */
export function actionById(id) {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown action ${id}`);
  return a;
}

/**
 * The guided flow's main button: the first enabled action in order of `step`.
 * @param {import("./state.js").AppState} state
 * @returns {Action | null}
 */
export function nextStep(state) {
  const steps = ACTIONS.filter((a) => a.step !== undefined).sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  return steps.find((a) => a.enabled(state)) ?? null;
}

/** Icon of the theme button for a mode. @param {string} mode */
export function themeIcon(mode) {
  return mode === "light" ? "theme-light" : mode === "dark" ? "theme-dark" : "theme-auto";
}
