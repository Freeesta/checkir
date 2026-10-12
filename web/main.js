// @ts-check
import { APP_NAME } from "./appname.js";
import { wire } from "./chart.js";
import { applyCatalog, currentLang, loadLang, pickLang, t } from "./i18n.js";
import { loadEngine } from "./engine.js";
import { parseSpectrum } from "./spectrum.js";

/** @param {string} id @returns {HTMLElement} */
function $(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/** Show the engine version, or its absence as a translated message. */
async function showEngine(/** @type {import("./engine.js").Engine | null} */ engine) {
  $("engine-version").textContent = engine ? t("engine.version", { version: engine.version() }) : t("engine.error");
}

async function start() {
  await loadLang(pickLang());
  $("app-name").textContent = APP_NAME;
  document.title = APP_NAME;
  const selector = /** @type {HTMLSelectElement} */ ($("language"));
  selector.value = currentLang();
  /** @type {import("./engine.js").Engine | null} */
  let engine = null;
  try {
    engine = await loadEngine();
  } catch {
    engine = null;
  }
  const redraw = engine
    ? wire(
        { chart: $("chart"), toolbar: $("chart-toolbar"), tab: $("table"), range: $("range") },
        parseSpectrum(engine.demo_spectrum()),
      )
    : () => {};
  const translate = () => {
    applyCatalog();
    redraw();
    showEngine(engine);
  };
  translate();
  selector.addEventListener("change", async () => {
    await loadLang(selector.value);
    translate();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  document.body.dataset.ready = "1";
}

start();
