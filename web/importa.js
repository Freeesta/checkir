// @ts-check
/**
 * Build the package of a private library from files of any format the engine reads, chosen by the user. Everything runs in the page with the
 * engine; nothing is sent anywhere. Only the spectra (resampled for the calculation, as the file gives them for drawing) and
 * the file names (as compound names) are kept: the metadata of the files (sample name, operator, paths…) is dropped.
 * @typedef {import("./state.js").Notice} Notice
 * @typedef {{ done: number, total: number }} Progress
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array, native?: Uint8Array }} Built
 * @typedef {{ built: Built | null, imported: number, unrecognized: number, skipped: { file: string, notice: Notice }[], cancelled: boolean, error: Notice | null }} Outcome
 */
import { BUDGET } from "./files.js";

/** Points of the library grid (650–3800 cm⁻¹, step 2). */
const POINTS = 1576;

/** Name of a library as an id: lower case letters, digits and single dashes. @param {string} name @returns {string} */
export function slug(name) {
  const s = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "library";
}

/** @param {string} base @param {Set<string>} taken @returns {string} */
export function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** An engine error, thrown as JSON text or returned as an object, becomes a translatable notice. @param {unknown} e @returns {Notice} */
export function noticeOf(e) {
  try {
    const v = typeof e === "string" ? JSON.parse(e) : e;
    if (v && typeof v === "object" && "error_key" in v) return { key: String(v.error_key), params: Object.fromEntries(Object.entries(/** @type {any} */ (v).params ?? {}).map(([k, x]) => [k, String(x)])) };
  } catch {
    // not an engine error
  }
  return { key: "err.file.unreadable", params: {} };
}

/** @param {number} ms @returns {Promise<void>} */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {import("./engine.js").Engine} engine
 * @param {File[]} files
 * @param {{ id: string, name: string, sampling?: string, date: string, attribution: { it: string, en: string } }} identity
 * @param {{ onProgress: (p: Progress) => void, signal: AbortSignal }} hooks
 * @returns {Promise<Outcome>}
 */
export async function buildPrivateLibrary(engine, files, identity, hooks) {
  /** @type {Outcome} */
  const out = { built: null, imported: 0, unrecognized: 0, skipped: [], cancelled: false, error: null };
  /** @type {Float32Array[]} */
  const rows = [];
  /** @type {Float32Array[]} */
  const natives = [];
  /** @type {object[]} */
  const index = [];
  let last = performance.now();
  for (const [i, file] of files.entries()) {
    if (hooks.signal.aborted) return { ...out, cancelled: true };
    try {
      if (file.size > BUDGET.maxBytes) throw JSON.stringify({ error_key: "reader.limit_exceeded", params: { limit: "bytes", max: BUDGET.maxBytes } });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const resampled = Float32Array.from(engine.library_resample(file.name, bytes));
      natives.push(Float32Array.from(engine.library_native(file.name, bytes)));
      rows.push(resampled);
      const id = `u${rows.length}`;
      index.push({ id, form: "imported", substance: id, names: { en: file.name.replace(/\.[^.]*$/, "") }, classes: [], quality: "pass", provenance_type: "user_import" });
    } catch (e) {
      const notice = noticeOf(e);
      if (notice.key === "reader.unknown_format") out.unrecognized++;
      else out.skipped.push({ file: file.name, notice });
    }
    hooks.onProgress({ done: i + 1, total: files.length });
    if (performance.now() - last > 30) {
      await pause(0);
      last = performance.now();
    }
  }
  if (hooks.signal.aborted) return { ...out, cancelled: true };
  out.imported = rows.length;
  if (!rows.length) return out;
  const values = new Float32Array(rows.length * POINTS);
  rows.forEach((r, k) => values.set(r, k * POINTS));
  const ident = { name: identity.id, version: "1", date: identity.date, license: "LicenseRef-private", attribution: identity.attribution, private: true, ...(identity.sampling && identity.sampling !== "unknown" ? { sampling: identity.sampling } : {}) };
  const built = JSON.parse(engine.library_build(JSON.stringify(ident), JSON.stringify({ schema: "ftir-library-index/1", spectra: index }), values));
  if ("error_key" in built) return { ...out, imported: 0, error: noticeOf(built) };
  const native = new Float32Array(natives.reduce((n, r) => n + r.length, 0));
  natives.reduce((at, r) => (native.set(r, at), at + r.length), 0);
  out.built = { id: identity.id, manifest: JSON.stringify(built.manifest), index: JSON.stringify(built.index), data: new Uint8Array(values.buffer), native: new Uint8Array(native.buffer) };
  return out;
}
