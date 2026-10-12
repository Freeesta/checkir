// @ts-check
/**
 * Loader of the calculation engine (the .wasm built by the workflow; it is not committed).
 * @typedef {{ versione: () => string, spettro_prova: () => string }} Motore
 */

/**
 * Load the engine on first use.
 * @returns {Promise<Motore>}
 */
export async function caricaMotore() {
  const percorso = "./wasm/ftir_wasm.js";
  const mod = await import(percorso);
  await mod.default();
  return mod;
}
