// @ts-check
import { APP_ID, APP_NAME } from "./appname.js";
import { wire } from "./chart.js";
import { createViewLink } from "./view_link.js";
import { refreshActionButtons } from "./controls.js";
import { buildDialogs } from "./dialogs.js";
import { buildHeader } from "./header.js";
import { applyCatalog, currentLang, LANGS, loadLang, pickLang, t } from "./i18n.js";
import { loadEngine } from "./engine.js";
import { createFolder } from "./cartella.js";
import { decisionActions } from "./decision.js";
import { setProgramVersion } from "./sheet.js";
import { talkActions, wireTalk } from "./talk.js";
import { libraryActions, loadAllLibraries } from "./librerie.js";
import { buildPanels } from "./panels.js";
import { addDemo, closeFile, spectrumOf, wireFileInput } from "./files.js";
import { attachShortcuts, onShortcutsChange } from "./shortcuts.js";
import { parseSpectrum } from "./spectrum.js";
import { buildLayers } from "./layers.js";
import { matchActions, startMatching } from "./match.js";
import { peaksActions } from "./peaks.js";
import { rangeContext } from "./ranges.js";
import { startRangeTable } from "./ranges_table.js";
import { activeFile, getState, subscribe, update } from "./state.js";
import { cycleTheme, initTheme } from "./theme.js";
import { hideIfDetached, relabelToggletips, toggletip } from "./tooltip.js";
import { buildSubtractView } from "./subtract_view.js";
import { subtractActions } from "./subtract.js";
import { buildLimits, buildNextStep } from "./workarea.js";

/** @param {string} id @returns {HTMLElement} */
function $(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/** Say something to screen readers (polite live region). @param {string} text */
function announce(text) {
  const live = $("status");
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
}

/** Keep the description meta tag in the active language. */
function setDescription() {
  document.getElementById("meta-description")?.setAttribute("content", t("share.description"));
}

/** @param {import("./actions.js").Ctx} ctx @param {{ refresh: (s: import("./state.js").AppState) => void }} next */
function wireShortcuts(ctx, next) {
  onShortcutsChange(() => {
    refreshActionButtons(getState());
    next.refresh(getState());
  });
  attachShortcuts(ctx);
}

/** @param {import("./engine.js").Engine | null} engine @param {(text: string) => void} announce @returns {() => void} */
function demoLoader(engine, announce) {
  return () => {
    if (!engine) return announce(t("engine.error"));
    addDemo(parseSpectrum(engine.demo_spectrum()));
    announce(t("status.demo_loaded"));
  };
}

/** Language and theme actions; `redraw` rebuilds every text after a language change. @param {() => void} redraw @param {(text: string) => void} say */
function languageActions(redraw, say) {
  /** @param {string} code */
  const setLang = async (code) => {
    if (!LANGS.includes(code) || code === currentLang()) return;
    await loadLang(code);
    redraw();
    say(t("status.lang_changed", { lang: t(code === "it" ? "lang.it" : "lang.en") }));
  };
  return {
    setLang,
    toggleLang: () => setLang(LANGS[(LANGS.indexOf(currentLang()) + 1) % LANGS.length]),
    cycleTheme: () => {
      const mode = cycleTheme();
      refreshActionButtons(getState());
      say(`${t("action.theme_cycle.label")}: ${t(`theme.${mode}`)}`);
    },
  };
}

/** Offline support, and the synthetic sheets to print for the counsellors, which exist only when the page is served from this machine. */
function startExtras() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(`sw.js?id=${APP_ID}`).catch(() => {});
  if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) import("./schede_prova.js").then((m) => m.mountSamples());
}

async function start() {
  initTheme();
  await loadLang(pickLang());
  document.title = APP_NAME;
  const engine = await loadEngine().catch(() => null);
  const input = wireFileInput({ engine, announce });
  let redrawAll = () => {};
  /** @type {import("./actions.js").Ctx} */
  const ctx = {
    getState,
    openFile: () => input.choose(),
    loadDemo: demoLoader(engine, announce),
    selectFile: (code) => update({ active: code }),
    closeFile: (code) => {
      closeFile(code);
      announce(t("status.file_closed"));
    },
    ...languageActions(() => redrawAll(), announce),
    ...matchActions(announce),
    ...peaksActions(engine, announce),
    ...subtractActions(engine, announce),
    ...rangeContext(announce, { cursorRange: () => chart.cursorRange(), openResults: () => panels.openSection("results") }),
    ...decisionActions(announce),
    ...talkActions(announce),
    togglePanel: () => panels.toggle(),
    goto: (id) => panels.openSection(id),
    closeSection: () => panels.closeSection(),
    openDialog: (id) => openDialog(id),
    folder: createFolder({ engine, announce }),
    ...libraryActions(engine, announce),
  };
  const header = buildHeader(/** @type {HTMLElement} */ ($("app-header")), ctx, APP_NAME);
  const panels = buildPanels({ panel: $("panel"), tabbar: $("tabbar") }, ctx);
  const next = buildNextStep($("workbar"), ctx);
  const limits = buildLimits($("limits"));
  const subtraction = buildSubtractView($("subtract"), ctx);
  const talk = wireTalk($("sheet-host"));
  if (engine) setProgramVersion(engine.version());
  const openDialog = buildDialogs(() => (engine ? engine.version() : null));
  $("chart-help").append(toggletip(() => t("chart.help"), () => t("chart.help_label")));
  const chart = wire({ chart: $("chart"), toolbar: $("chart-toolbar"), tab: $("table"), range: $("range") }, { announce, link: createViewLink(), onBrush: (from, to) => ctx.addRange([from, to]) });
  let shown = /** @type {string | null | undefined} */ (undefined);
  const layers = buildLayers(chart);
  const renderUi = () => {
    const s = getState();
    const code = activeFile(s)?.code ?? null;
    if (code !== shown) {
      shown = code;
      chart.set(code ? (spectrumOf(code) ?? null) : null);
    }
    layers.sync(s, shown ?? null);
    document.body.toggleAttribute("data-subtract", s.subtraction !== null);
    subtraction.refresh(s);
    header.refresh(s);
    panels.refresh(s);
    next.refresh(s);
    limits.refresh();
    talk.refresh(s);
    refreshActionButtons(s);
    hideIfDetached();
    $("engine-version").textContent = engine ? t("engine.version", { version: engine.version() }) : t("engine.error");  };
  redrawAll = () => {
    layers.reset();
    applyCatalog();
    setDescription();
    relabelToggletips();
    renderUi();
    chart.redraw();
  };
  subscribe(renderUi);
  startMatching({ announce });
  startRangeTable();
  wireShortcuts(ctx, next);
  redrawAll();
  if (engine) loadAllLibraries(engine);
  startExtras();
  document.body.dataset.ready = "1";
}

start();
