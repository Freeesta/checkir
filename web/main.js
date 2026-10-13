// @ts-check
import { APP_ID, APP_NAME } from "./appname.js";
import { wire } from "./chart.js";
import { refreshActionButtons } from "./controls.js";
import { buildDialogs } from "./dialogs.js";
import { buildHeader } from "./header.js";
import { applyCatalog, currentLang, LANGS, loadLang, pickLang, t } from "./i18n.js";
import { loadEngine } from "./engine.js";
import { libraryActions, loadAllLibraries } from "./librerie.js";
import { buildPanels } from "./panels.js";
import { addDemo, closeFile, spectrumOf, wireFileInput } from "./files.js";
import { attachShortcuts, onShortcutsChange } from "./shortcuts.js";
import { parseSpectrum } from "./spectrum.js";
import { buildLayers } from "./layers.js";
import { matchActions, startMatching } from "./match.js";
import { activeFile, getState, subscribe, update } from "./state.js";
import { cycleTheme, initTheme } from "./theme.js";
import { hideIfDetached, relabelToggletips, toggletip } from "./tooltip.js";
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
    setLang: async (code) => {
      if (!LANGS.includes(code) || code === currentLang()) return;
      await loadLang(code);
      redrawAll();
      announce(t("status.lang_changed", { lang: t(code === "it" ? "lang.it" : "lang.en") }));
    },
    toggleLang: () => ctx.setLang(LANGS[(LANGS.indexOf(currentLang()) + 1) % LANGS.length]),
    cycleTheme: () => {
      const mode = cycleTheme();
      refreshActionButtons(getState());
      announce(`${t("action.theme_cycle.label")}: ${t(`theme.${mode}`)}`);
    },
    ...matchActions(announce),
    togglePanel: () => panels.toggle(),
    goto: (id) => panels.openSection(id),
    openDialog: (id) => openDialog(id),
    ...libraryActions(engine, announce),
  };
  const header = buildHeader(/** @type {HTMLElement} */ ($("app-header")), ctx, APP_NAME);
  const panels = buildPanels({ panel: $("panel"), tabbar: $("tabbar") }, ctx);
  const next = buildNextStep($("workbar"), ctx);
  const limits = buildLimits($("limits"));
  const openDialog = buildDialogs(() => (engine ? engine.version() : null));
  $("chart-help").append(toggletip(() => t("chart.help"), () => t("chart.help_label")));
  const chart = wire({ chart: $("chart"), toolbar: $("chart-toolbar"), tab: $("table"), range: $("range") });
  /** @type {string | null | undefined} */
  let shown;
  const layers = buildLayers(chart);
  const renderUi = () => {
    const s = getState();
    const code = activeFile(s)?.code ?? null;
    if (code !== shown) {
      shown = code;
      chart.set(code ? (spectrumOf(code) ?? null) : null);
    }
    layers.sync(s, shown ?? null);
    header.refresh(s);
    panels.refresh(s);
    next.refresh(s);
    limits.refresh();
    refreshActionButtons(s);
    hideIfDetached();
    $("engine-version").textContent = engine ? t("engine.version", { version: engine.version() }) : t("engine.error");
  };
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
  wireShortcuts(ctx, next);
  redrawAll();
  if (engine) loadAllLibraries(engine);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(`sw.js?id=${APP_ID}`).catch(() => {});
  document.body.dataset.ready = "1";
}

start();
