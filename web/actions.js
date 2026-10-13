// @ts-check
import { draftOf, isSignable } from "./decision.js";
import { lastResidual } from "./files.js";
import { activeLibraries, decisionOf, resultOf } from "./state.js";
import { canSubtract } from "./subtract.js";
/**
 * Registry of everything the user can do. Header, panel, work-area bar, phone menu and (later) shortcut help are generated from it.
 * `step` orders the guided flow: the "next step" button shows the first enabled action by `step`. `key` is the single-key shortcut (same in every language, run by shortcuts.js); an action not built yet has `soon` and `enabled` always false (the shortcut list shows it grey).
 * @typedef {{
 *   getState: () => import("./state.js").AppState,
 *   openFile: () => void, loadDemo: () => void, selectFile: (code: string) => void, closeFile: (code: string) => void, setLang: (code: string) => void, toggleLang: () => void, cycleTheme: () => void,
 *   togglePanel: () => void, goto: (panelId: string) => void, closeSection: () => void, openDialog: (id: string) => void, folder: FolderCtx,
 *   setDraft: (patch: Partial<import("./state.js").DecisionDraft>) => void, signDecision: () => void, revokeDecision: () => void, setSheetLang: (lang: string) => Promise<void>, toggleTalk: () => void, printSheet: () => void,
 *   runMatch: () => void, selectCandidate: (key: string) => void, setLabel: (key: string, label: import("./state.js").ChemistLabel | null) => void, toggleOverlay: () => void,
 *   togglePeaks: () => void, focusPeak: (id: string | null) => void, stepPeak: (dir: 1 | -1) => boolean, clearPeak: () => boolean,
 *   setTextLevel: (level: import("./state.js").TextLevel) => void, stepLevel: (dir: 1 | -1) => void, toggleModeAnim: () => void, showRule: (range: import("./state.js").RuleRange | null) => void,
 *   subtractOpen: () => void, subtractClose: () => void, subtractSearch: () => Promise<boolean>, setFactor: (k: number) => void, undo: () => void,
 *   setPreset: (id: string) => void, setRanges: (ranges: Array<[number, number]>) => void, addRange: (range: [number, number]) => void, removeRange: (i: number) => void, clearRanges: () => void, rejectRange: () => void, rangeFromCursors: () => void, openRanges: () => void,
 *   importLibrary: (files: File[], name: string) => Promise<void>, cancelImport: () => void, removeLibrary: (id: string) => void, toggleLibrary: (id: string, on: boolean) => void,
 * }} Ctx
 * @typedef {{
 *   choose: () => Promise<void>, resume: () => Promise<void>, stop: () => void, setRemember: (on: boolean) => Promise<void>, setAuto: (on: boolean) => void,
 *   openOffer: (id: string) => Promise<void>, ignoreOffer: (id: string) => void, pickLast: () => void,
 * }} FolderCtx
 * @typedef {{
 *   id: string, labelKey: string, tipKey: string, icon: string, key?: string, section?: string, step?: number, soon?: boolean,
 *   run: (ctx: Ctx) => void, enabled: (state: import("./state.js").AppState) => boolean,
 * }} Action
 */

const always = () => true;

/** @param {number} n @param {string} id @param {string} icon @returns {Action} */
function gotoAction(n, id, icon) {
  return {
    id: `panel.goto.${n}`,
    labelKey: `panel.${id}.title`,
    tipKey: `panel.${id}.tip`,
    icon,
    key: String(n),
    section: id,
    run: (ctx) => ctx.goto(id),
    enabled: always,
  };
}

/** @type {Action[]} */
export const ACTIONS = [
  { id: "file.open", labelKey: "action.file_open.label", tipKey: "action.file_open.tip", icon: "upload", key: "o", section: "files", step: 1, run: (c) => c.openFile(), enabled: always },
  { id: "demo.load", labelKey: "action.demo_load.label", tipKey: "action.demo_load.tip", icon: "demo", section: "files", run: (c) => c.loadDemo(), enabled: always },
  { id: "file.close", labelKey: "action.file_close.label", tipKey: "action.file_close.tip", icon: "close", section: "files", run: (c) => { const code = c.getState().active; if (code) c.closeFile(code); }, enabled: (s) => s.files.length > 0 },
  { id: "match.run", labelKey: "action.match_run.label", tipKey: "action.match_run.tip", icon: "compare", key: "c", section: "results", step: 2, run: (c) => c.runMatch(), enabled: (s) => s.files.length > 0 && activeLibraries(s).length > 0 },
  { id: "subtract.open", labelKey: "action.subtract_open.label", tipKey: "action.subtract_open.tip", icon: "subtract", key: "d", section: "results", step: 3, run: (c) => { c.subtractOpen(); c.closeSection(); }, enabled: (s) => s.subtraction === null && canSubtract(s) },
  { id: "subtract.search", labelKey: "action.subtract_search.label", tipKey: "action.subtract_search.tip", icon: "compare", section: "results", run: async (c) => { if (await c.subtractSearch()) c.goto("results"); }, enabled: (s) => s.subtraction !== null },
  { id: "subtract.close", labelKey: "action.subtract_close.label", tipKey: "action.subtract_close.tip", icon: "close", section: "results", run: (c) => c.subtractClose(), enabled: (s) => s.subtraction !== null },
  { id: "sheet.open", labelKey: "action.sheet_open.label", tipKey: "action.sheet_open.tip", icon: "sheet", key: "s", section: "sheet", step: 4, run: (c) => c.goto("sheet"), enabled: (s) => resultOf(s) !== null },
  { id: "decision.sign", labelKey: "action.decision_sign.label", tipKey: "action.decision_sign.tip", icon: "pen", key: "f", section: "sheet", run: (c) => c.signDecision(), enabled: (s) => { const d = draftOf(s); return d !== null && decisionOf(s) === null && isSignable(d); } },
  { id: "decision.revoke", labelKey: "action.decision_revoke.label", tipKey: "action.decision_revoke.tip", icon: "back", section: "sheet", run: (c) => c.revokeDecision(), enabled: (s) => decisionOf(s) !== null },
  { id: "sheet.print", labelKey: "action.sheet_print.label", tipKey: "action.sheet_print.tip", icon: "sheet", section: "sheet", run: (c) => c.printSheet(), enabled: (s) => resultOf(s) !== null },
  { id: "overlay.toggle", labelKey: "action.overlay_toggle.label", tipKey: "action.overlay_toggle.tip", icon: "results", key: "r", section: "results", run: (c) => c.toggleOverlay(), enabled: (s) => resultOf(s) !== null },
  { id: "ranges.open", labelKey: "action.ranges_open.label", tipKey: "action.ranges_open.tip", icon: "region", key: "g", section: "results", run: (c) => c.openRanges(), enabled: (s) => s.files.length > 0 },
  { id: "peaks.toggle", labelKey: "action.peaks_toggle.label", tipKey: "action.peaks_toggle.tip", icon: "peaks", key: "p", section: "peaks", run: (c) => c.togglePeaks(), enabled: (s) => s.files.length > 0 },
  { id: "sheet.talk", labelKey: "action.sheet_talk.label", tipKey: "action.sheet_talk.tip", icon: "sheet", key: "m", section: "sheet", run: (c) => c.toggleTalk(), enabled: (s) => resultOf(s) !== null },
  { id: "history.undo", labelKey: "action.history_undo.label", tipKey: "action.history_undo.tip", icon: "back", key: "u", run: (c) => c.undo(), enabled: (s) => lastResidual(s) !== undefined },
  { id: "panel.toggle", labelKey: "action.panel_toggle.label", tipKey: "action.panel_toggle.tip", icon: "panel-open", key: "[", run: (c) => c.togglePanel(), enabled: always },
  gotoAction(1, "files", "file"),
  gotoAction(2, "libraries", "library"),
  gotoAction(3, "results", "results"),
  gotoAction(4, "peaks", "peaks"),
  gotoAction(5, "sheet", "sheet"),
  { id: "info.open", labelKey: "action.info_open.label", tipKey: "action.info_open.tip", icon: "info", key: "i", run: (c) => c.openDialog("info"), enabled: always },
  { id: "help.open", labelKey: "action.help_open.label", tipKey: "action.help_open.tip", icon: "keyboard", key: "?", run: (c) => c.openDialog("help"), enabled: always },
  { id: "privacy.open", labelKey: "action.privacy_open.label", tipKey: "action.privacy_open.tip", icon: "lock", run: (c) => c.openDialog("info"), enabled: always },
  { id: "lang.toggle", labelKey: "lang.label", tipKey: "action.lang_toggle.tip", icon: "language", key: "l", run: (c) => c.toggleLang(), enabled: always },
  { id: "theme.cycle", labelKey: "action.theme_cycle.label", tipKey: "action.theme_cycle.tip", icon: "theme-auto", key: "t", run: (c) => c.cycleTheme(), enabled: always },
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
