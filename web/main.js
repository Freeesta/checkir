// @ts-check
import { APP_ID, APP_NAME } from "./appname.js";
import { wire } from "./chart_wire.js";
import { createViewLink } from "./view_link.js";
import { refreshActionButtons } from "./controls.js";
import { buildDialogs } from "./dialogs.js";
import { buildHeader } from "./header.js";
import { applyCatalog, currentLang, LANGS, loadLang, pickLang, t } from "./i18n.js";
import { loadEngine } from "./engine.js";
import { createFolder } from "./cartella.js";
import { decisionActions } from "./decision.js";
import { setProgramVersion } from "./sheet.js";
import { hideSplash, labelSplash } from "./splash.js";
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
import { loadBands } from "./regions.js";
import { loadBandData } from "./bands_data.js";
import { createPeakCard } from "./peak_card.js";
import { activeFile, getState, subscribe, update } from "./state.js";
import { cycleTheme, initTheme } from "./theme.js";
import { hideIfDetached, relabelToggletips, toggletip } from "./tooltip.js";
import { buildSubtractView } from "./subtract_view.js";
import { recallActions } from "./recall.js";
import { focusedPosition, openInverseDialog } from "./inverse_ui.js";
import { buildRecallView, openRecallDialog } from "./recall_ui.js";
import { subtractActions } from "./subtract.js";
import { buildCandidates, buildNextStep } from "./workarea.js";

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
    await loadBandData(code);
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

/** Title and footer carry the product name; the loading screen gets its translated label. */
function showName() {
  document.title = APP_NAME;
  $("footer-name").textContent = APP_NAME;
  labelSplash();
}

/** Last step of the start-up: libraries, offline support, loading screen away, page marked ready. @param {import("./engine.js").Engine | null} engine */
function finishStart(engine) {
  if (engine) loadAllLibraries(engine);
  startExtras();
  hideSplash();
  document.body.dataset.ready = "1";
}

/** The actions of the analysis work: matching, peaks, subtraction, decision and talk mode. @param {import("./engine.js").Engine | null} engine @param {(text: string) => void} announce */
function workActions(engine, announce) {
  return { ...matchActions(announce), ...peaksActions(engine, announce), ...subtractActions(engine, announce), ...decisionActions(announce), ...talkActions(announce) };
}

/** What the chart's arrow keys do with the picked peak. @param {import("./actions.js").Ctx} ctx */
function chartPeakKeys(ctx) {
  return { step: (/** @type {-1 | 1} */ dir) => ctx.stepPeak(dir), clear: () => ctx.clearPeak(), level: (/** @type {-1 | 1} */ dir) => (getState().peakFocus ? (ctx.stepLevel(dir), true) : false) };
}

async function start() {
  initTheme();
  await loadLang(pickLang());
  showName();
  const engine = await loadEngine().catch(() => null);
  await loadBands();
  await loadBandData(currentLang());
  const input = wireFileInput({ engine, announce });
  let redrawAll = () => {}, viewBack = () => {};
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
    ...workActions(engine, announce), ...recallActions(announce), recallOpen: () => openRecallDialog(ctx), inverseOpen: (position) => openInverseDialog(ctx, position === undefined ? focusedPosition(getState()) : position), viewBack: () => viewBack(),
    ...rangeContext(announce, { cursorRange: () => chart.cursorRange(), openResults: () => panels.openSection("results") }),
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
  const candidates = buildCandidates($("candidates"), ctx);
  const subtraction = buildSubtractView($("subtract"), ctx);
  const recalled = buildRecallView($("recall"), ctx);
  const talk = wireTalk($("sheet-host"));
  if (engine) setProgramVersion(engine.version());
  const openDialog = buildDialogs(() => (engine ? engine.version() : null));
  $("chart-help").append(toggletip(() => t("chart.help"), () => t("chart.help_label")));
  const chart = wire({ chart: $("chart"), toolbar: $("chart-toolbar"), tab: $("table"), range: $("range") }, { announce, ctx, codeOf: () => activeFile(getState())?.code ?? null, link: createViewLink(), onBrush: (from, to) => ctx.addRange([from, to]), peaks: chartPeakKeys(ctx) });
  viewBack = chart.back;
  let shown = /** @type {string | null | undefined} */ (undefined);
  const layers = buildLayers(chart, $("peaks-summary"));
  const card = createPeakCard($("peak-card"), ctx);
  const renderUi = () => {
    const s = getState();
    const code = activeFile(s)?.code ?? null;
    if (code !== shown) {
      shown = code;
      chart.set(code ? (spectrumOf(code) ?? null) : null);
    }
    layers.sync(s, shown ?? null);
    card.refresh(s);
    document.body.toggleAttribute("data-subtract", s.subtraction !== null);
    for (const part of [subtraction, recalled, header, panels]) part.refresh(s);
    next.refresh(s);
    candidates.refresh(s);
    talk.refresh(s);
    refreshActionButtons(s);
    hideIfDetached();
  };
  redrawAll = () => {
    layers.reset();
    card.reset();
    applyCatalog();
    setDescription();
    relabelToggletips();
    renderUi();
    chart.redraw();
  };
  subscribe(renderUi);
  startMatching({ announce }); startRangeTable();
  wireShortcuts(ctx, next); redrawAll();
  finishStart(engine);
}

start().catch((e) => {
  hideSplash();
  throw e;
});
