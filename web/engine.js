// @ts-check
/**
 * Loader of the calculation engine (the .wasm built by the workflow; it is not committed).
 * @typedef {{ version: () => string, demo_spectrum: () => string, open_file: (name: string, bytes: Uint8Array, maxBytes: number, maxPoints: number) => string, library_open: (manifest: string, index: string, data: Uint8Array, maxBytes: number, maxSpectra: number) => string, library_resample: (jdx: Uint8Array) => Float32Array, library_native: (jdx: Uint8Array) => Float32Array, library_build: (identity: string, index: string, values: Float32Array) => string, detect_peaks: (spectrumJson: string, thresholdsJson: string) => string, interpretations_at: (cm1: number, tolCm1: number, rulesJson: string) => string, didactic_spring: (k: number, massA: number, massB: number) => string, didactic_penetration_depth: (nu: number, nCrystal: number, nSample: number, angle: number) => string, didactic_ratio: (sample: Float64Array, background: Float64Array) => string, didactic_interferogram_from_lines: (linesJson: string, halfPoints: number, stepCm: number) => string, didactic_spectrum_from_interferogram: (intensity: Float64Array, stepCm: number, zpdIndex: number, optionsJson: string) => string, didactic_vibration_frames: (atomsJson: string, frameCount: number) => string, assign_peaks: (samplePeaks: string, references: string, context: string, thresholds: string) => string, fattore_proposto: SubtractionCall, sottrai: SubtractionCall }} Engine
 * The two calls of the manual subtraction: sample and reference as (unit, wavenumbers, values), then the parameters as JSON.
 * @typedef {(sampleUnit: string, sampleX: Float64Array, sampleY: Float64Array, referenceUnit: string, referenceX: Float64Array, referenceY: Float64Array, paramsJson: string) => string} SubtractionCall
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
