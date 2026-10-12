// @ts-check
import { APP_NAME } from "./appname.js";
import { collega } from "./grafico.js";
import { applyCatalog, currentLang, loadLang, pickLang, t } from "./i18n.js";
import { caricaMotore } from "./motore.js";
import { leggiSpettro } from "./spettro.js";

/** @param {string} id @returns {HTMLElement} */
function $(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/** Show the engine version, or its absence as a translated message. */
async function mostraMotore(/** @type {import("./motore.js").Motore | null} */ motore) {
  $("versione-motore").textContent = motore ? t("motore.versione", { version: motore.versione() }) : t("motore.errore");
}

async function avvia() {
  await loadLang(pickLang());
  $("nome-app").textContent = APP_NAME;
  const selettore = /** @type {HTMLSelectElement} */ ($("lingua"));
  selettore.value = currentLang();
  /** @type {import("./motore.js").Motore | null} */
  let motore = null;
  try {
    motore = await caricaMotore();
  } catch {
    motore = null;
  }
  const ridisegna = motore
    ? collega(
        { grafico: $("grafico"), barra: $("barra-grafico"), tab: $("tabella"), intervallo: $("intervallo") },
        leggiSpettro(motore.spettro_prova()),
      )
    : () => {};
  const traduci = () => {
    applyCatalog();
    ridisegna();
    mostraMotore(motore);
  };
  traduci();
  selettore.addEventListener("change", async () => {
    await loadLang(selettore.value);
    traduci();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  document.body.dataset.ready = "1";
}

avvia();
