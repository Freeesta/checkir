// @ts-check
/**
 * Builds the peak index of a library inside the worker: from the cache when it is current, otherwise by detecting the peaks
 * of every spectrum, a slice of time at a time so the worker keeps answering. Needs the engine module of the worker.
 * @typedef {{ id: string, version: string, rows: unknown[], values: Float32Array, from: number, step: number }} IndexJob
 */
import { readIndex, writeIndex } from "./peak_index_cache.js";

/** Longest stretch of work before yielding to the event loop, in ms (the page asks for tasks under 50 ms). */
const SLICE_MS = 25;

/**
 * @param {any} mod the engine module @param {IndexJob} job
 * @param {(done: number, total: number) => void} progress @param {() => boolean} stale true when the library was replaced or removed
 * @returns {Promise<"cache" | "built" | "stale" | "failed">}
 */
export async function ensurePeakIndex(mod, job, progress, stale) {
  const total = job.rows.length;
  const saved = await readIndex(job.id);
  if (saved && !JSON.parse(mod.peak_index_import(job.id, job.version, saved)).error_key) {
    progress(total, total);
    return "cache";
  }
  const n = total ? Math.round(job.values.length / total) : 0;
  const axis = Float64Array.from({ length: n }, (_, i) => job.from + job.step * i);
  if (JSON.parse(mod.peak_index_begin(job.id, job.version)).error_key) return "failed";
  for (let i = 0; i < total; ) {
    const until = performance.now() + SLICE_MS;
    while (i < total && performance.now() < until) {
      const answer = JSON.parse(mod.peak_index_add(job.id, "absorbance", axis, Float64Array.from(job.values.subarray(i * n, (i + 1) * n))));
      if (answer.error_key) return "failed";
      i++;
    }
    progress(i, total);
    await new Promise((r) => setTimeout(r, 0));
    if (stale()) return "stale";
  }
  if (JSON.parse(mod.peak_index_finish(job.id)).error_key) return "failed";
  await writeIndex(job.id, mod.peak_index_export(job.id));
  return "built";
}
