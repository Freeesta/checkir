// @ts-check
/**
 * The comparison runs here so the page stays responsive. This worker has its own engine (and its own copy of the libraries,
 * sent by the page); it never touches the network; its only storage is the cache of the peak indexes (`peak_index_cache.js`). Messages in: `sync` (the libraries to hold), `run` and `peak_query`;
 * messages out: `synced`, `twins` (progress of the spectral twins), `peak_index` (progress of the peak index of a library),
 * `result`, `peak_result` (answer to `peak_query`), `error`.
 * @typedef {{ id: string, version: string, rows?: Array<{ id: string, substance?: string, form?: string, names: { it?: string, en: string } }>, values?: Float32Array, from?: number, step?: number }} LibMessage
 */
import { ensurePeakIndex } from "./peak_index_job.js";

/** The worker global scope (typed loosely: the project compiles with the DOM library only). @type {any} */
const scope = self;
/** @type {any} */
let mod = null;
/** @type {Map<string, string>} */
const held = new Map();
let twinsRunning = false;
/** Libraries whose peak index is ready to answer. @type {Set<string>} */
const indexed = new Set();

async function engine() {
  if (mod) return mod;
  const path = "./wasm/ftir_wasm.js";
  mod = await import(path);
  await mod.default();
  return mod;
}

/** @param {LibMessage} lib @returns {string | null} first error key, or null */
function addLibrary(lib) {
  const { rows = [], values = new Float32Array(), from = 650, step = 2 } = lib;
  const n = rows.length ? Math.round(values.length / rows.length) : 0;
  const axis = Float64Array.from({ length: n }, (_, i) => from + step * i);
  mod.confronto_libreria_inizia(lib.id, lib.version);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const answer = JSON.parse(mod.confronto_libreria_aggiungi(lib.id, r.id, r.substance ?? "", r.names.en, r.form ?? "", "absorbance", axis, Float64Array.from(values.subarray(i * n, (i + 1) * n))));
    if (answer.error_key) return answer.error_key;
  }
  return null;
}

/** The spectral twins are computed in small blocks, yielding between them so a `run` message is never kept waiting. */
async function stepTwins() {
  if (twinsRunning) return;
  twinsRunning = true;
  for (;;) {
    const { done, total } = JSON.parse(mod.confronto_gemelli_blocco());
    scope.postMessage({ type: "twins", done, total });
    if (done >= total) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  twinsRunning = false;
}

/** Builds (or reads from the cache) the peak index of a library, then tells the page. @param {LibMessage} lib */
async function indexLibrary(lib) {
  const { rows = [], values = new Float32Array(), from = 650, step = 2 } = lib;
  const progress = (/** @type {number} */ done, /** @type {number} */ total) => scope.postMessage({ type: "peak_index", id: lib.id, done, total, ready: false });
  const how = await ensurePeakIndex(mod, { id: lib.id, version: lib.version, rows, values, from, step }, progress, () => held.get(lib.id) !== lib.version);
  if (how === "cache" || how === "built") indexed.add(lib.id);
  if (how !== "stale") scope.postMessage({ type: "peak_index", id: lib.id, done: rows.length, total: rows.length, ready: indexed.has(lib.id), how });
}

/** @param {{ runId: number, libs: string[], query: unknown }} job the libraries to search (those without an index yet are left out) */
function peakQuery(job) {
  const results = job.libs.filter((id) => indexed.has(id)).map((id) => ({ lib: id, json: mod.peak_index_query(id, JSON.stringify(job.query)) }));
  scope.postMessage({ type: "peak_result", runId: job.runId, results, missing: job.libs.filter((id) => !indexed.has(id)) });
}

/** @param {LibMessage[]} libs the libraries to hold; `rows` is present only for those not sent before */
async function sync(libs) {
  await engine();
  const want = new Set(libs.map((l) => l.id));
  for (const id of [...held.keys()]) {
    if (!want.has(id) || libs.some((l) => l.id === id && l.rows && held.get(id) !== l.version)) {
      mod.confronto_libreria_togli(id);
      mod.peak_index_remove(id);
      indexed.delete(id);
      held.delete(id);
    }
  }
  for (const lib of libs) {
    if (held.has(lib.id) || !lib.rows) continue;
    const bad = addLibrary(lib);
    if (bad) return scope.postMessage({ type: "error", key: bad });
    held.set(lib.id, lib.version);
  }
  scope.postMessage({ type: "synced", ids: [...held.keys()] });
  stepTwins();
  for (const lib of libs) if (lib.rows && held.get(lib.id) === lib.version) indexLibrary(lib).catch(() => scope.postMessage({ type: "peak_index", id: lib.id, done: 0, total: 0, ready: false, how: "failed" }));
}

/** @param {{ runId: number, query: unknown, options: unknown }} job */
async function run(job) {
  await engine();
  scope.postMessage({ type: "result", runId: job.runId, json: mod.confronta(JSON.stringify(job.query), JSON.stringify(job.options)) });
}

/** Syncs and runs go one after the other: a run that overtook the sync still starting the engine saw no library ("library not loaded"). */
let ordered = Promise.resolve();

scope.addEventListener("message", (/** @type {MessageEvent} */ e) => {
  const m = e.data;
  const failed = (/** @type {unknown} */ err) => scope.postMessage({ type: "error", runId: m.runId, key: "engine.error", detail: String(err) });
  if (m.type === "sync") ordered = ordered.then(() => sync(m.libs)).catch(failed);
  else if (m.type === "run") ordered = ordered.then(() => run(m)).catch(failed);
  else if (m.type === "peak_query") peakQuery(m);
});
