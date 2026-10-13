// @ts-check
import { APP_ID, APP_NAME } from "./appname.js";
import { wire } from "./chart.js";
import { refreshActionButtons } from "./controls.js";
import { buildDialogs } from "./dialogs.js";
import { buildHeader } from "./header.js";
import { applyCatalog, currentLang, LANGS, loadLang, pickLang, t } from "./i18n.js";
import { loadEngine } from "./engine.js";
import { buildPanels } from "./panels.js";
import { parseSpectrum } from "./spectrum.js";
import { getState, subscribe, update } from "./state.js";
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

/** @param {import("./spectrum.js").Spectrum} s @returns {import("./state.js").FileEntry} */
function demoEntry(s) {
  const xs = s.wavenumber_cm1;
  return { code: "C1", name: null, demo: true, points: xs.length, fromCm1: Math.max(...xs), toCm1: Math.min(...xs), stepCm1: Math.abs(xs[1] - xs[0]), role: "sample", warnings: [] };
}

async function start() {
  initTheme();
  await loadLang(pickLang());
  document.title = APP_NAME;
  const engine = await loadEngine().catch(() => null);
  const picker = document.createElement("input");
  picker.type = "file";
  picker.hidden = true;
  picker.addEventListener("change", () => {
    if (picker.files?.length) announce(t("status.file_pending"));
    picker.value = "";
  });
  document.body.append(picker);
  /** @type {() => void} */
  let redrawAll = () => {};
  /** @type {import("./actions.js").Ctx} */
  const ctx = {
    getState,
    openFile: () => picker.click(),
    loadDemo: () => {
      if (!engine) return announce(t("engine.error"));
      update({ files: [demoEntry(parseSpectrum(engine.demo_spectrum()))] });
      announce(t("status.demo_loaded"));
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
    togglePanel: () => panels.toggle(),
    goto: (id) => panels.openSection(id),
    openDialog: (id) => openDialog(id),
  };
  const header = buildHeader(/** @type {HTMLElement} */ ($("app-header")), ctx, APP_NAME);
  const panels = buildPanels({ panel: $("panel"), tabbar: $("tabbar") }, ctx);
  const next = buildNextStep($("workbar"), ctx);
  const limits = buildLimits($("limits"));
  const openDialog = buildDialogs(() => (engine ? engine.version() : null));
  $("chart-help").append(toggletip(() => t("chart.help"), () => t("chart.help_label")));
  const redrawChart = engine
    ? wire({ chart: $("chart"), toolbar: $("chart-toolbar"), tab: $("table"), range: $("range") }, parseSpectrum(engine.demo_spectrum()))
    : () => {};
  const renderUi = () => {
    const s = getState();
    header.refresh(s);
    panels.refresh(s);
    next.refresh(s);
    limits.refresh();
    refreshActionButtons(s);
    hideIfDetached();
    $("engine-version").textContent = engine ? t("engine.version", { version: engine.version() }) : t("engine.error");
  };
  redrawAll = () => {
    applyCatalog();
    setDescription();
    relabelToggletips();
    renderUi();
    redrawChart();
  };
  subscribe(renderUi);
  redrawAll();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(`sw.js?id=${APP_ID}`).catch(() => {});
  document.body.dataset.ready = "1";
}

start();
