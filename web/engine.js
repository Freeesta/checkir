// @ts-check
/**
 * Loader of the calculation engine (the .wasm built by the workflow; it is not committed).
 * @typedef {{ version: () => string, demo_spectrum: () => string, open_file: (name: string, bytes: Uint8Array, maxBytes: number, maxPoints: number) => string }} Engine
 */

/**
 * Load the engine on first use.
 * @returns {Promise<Engine>}
 */
export async function loadEngine() {
  const path = "./wasm/ftir_wasm.js";
  const mod = await import(path);
  await mod.default();
  return mod;
}
