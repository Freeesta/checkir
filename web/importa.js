// @ts-check
/**
 * Build the package of a private library from files of any format the engine reads, chosen by the user. Everything runs in the page with the
 * engine; nothing is sent anywhere. Only the spectra (resampled for the calculation, as the file gives them for drawing) and
 * the file names (as compound names) are kept: the metadata of the files (sample name, operator, paths…) is dropped.
 * @typedef {import("./state.js").Notice} Notice
 * @typedef {{ done: number, total: number }} Progress
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array, native?: Uint8Array }} Built
 * @typedef {{ built: Built | null, imported: number, unrecognized: number, repeated: number, warnings: Notice[], skipped: { file: string, notice: Notice }[], cancelled: boolean, error: Notice | null }} Outcome
 */
import { BUDGET } from "./files.js";

/** Hex SHA-256 of the bytes, to leave out a file that is the same spectrum as one already read. @param {ArrayBuffer} bytes @returns {Promise<string>} */
async function digest(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

/** Extension of a file name, lower case, with the dot. @param {string} name @returns {string} */
const extOf = (name) => (/\.[^.]*$/.exec(name)?.[0] ?? "").toLowerCase();
/** @param {string} name @returns {string} */
const stemOf = (name) => name.replace(/\.[^.]*$/, "").toLowerCase();

/**
 * Group the chosen files in the units to read. A Shimadzu library is one unit with many entries: the `.L01` with the `.nam` of the same name (or the only
 * `.nam` chosen); the `.IDX` and the `.nam` accompany the `.L01` and are not files to read. Any other file is a unit alone.
 * @typedef {{ file: File, nam?: File }} Unit
 * @param {File[]} files @returns {Unit[]}
 */
export function unitsOf(files) {
  const l01 = files.filter((f) => extOf(f.name) === ".l01");
  const nams = files.filter((f) => extOf(f.name) === ".nam");
  const rest = files.filter((f) => extOf(f.name) !== ".l01" && !(l01.length && [".nam", ".idx"].includes(extOf(f.name))));
  const nameFile = (/** @type {File} */ f) => nams.find((n) => stemOf(n.name) === stemOf(f.name)) ?? (l01.length === 1 && nams.length === 1 ? nams[0] : undefined);
  return [...l01.map((file) => ({ file, nam: nameFile(file) })), ...rest.map((file) => ({ file }))];
}

/**
 * One spectrum of the library: on the grid and as the file gives it.
 * @typedef {{ title: string, resampled: Float32Array, native: Float32Array }} Item
 */

/** The records `[points, resolution, x…, y…]` one after the other, cut one by one. @param {Float32Array} all @returns {Float32Array[]} */
function records(all) {
  /** @type {Float32Array[]} */
  const out = [];
  for (let at = 0; at < all.length; at += 2 + 2 * all[at]) out.push(all.slice(at, at + 2 + 2 * all[at]));
  return out;
}

/**
 * The entries of a Shimadzu library, named by the `.nam` file (an entry without a name takes the file name and its number); the reader's notices go to `warnings`.
 * @param {import("./engine.js").Engine} engine @param {Uint8Array} l01 @param {Uint8Array} nam @param {string} base @param {Notice[]} warnings @returns {Item[]}
 */
function shimadzuItems(engine, l01, nam, base, warnings) {
  const meta = JSON.parse(engine.library_shimadzu_meta(l01, nam, BUDGET.maxBytes));
  const values = Float32Array.from(engine.library_shimadzu_resample(l01, nam, BUDGET.maxBytes));
  const native = records(Float32Array.from(engine.library_shimadzu_native(l01, nam, BUDGET.maxBytes)));
  for (const w of meta.warnings) warnings.push({ key: w.key, params: Object.fromEntries(Object.entries(w.params).map(([k, v]) => [k, String(v)])) });
  return meta.names.map((/** @type {string} */ name, /** @type {number} */ k) => ({ title: name.trim() || `${base} ${k + 1}`, resampled: values.slice(k * POINTS, (k + 1) * POINTS), native: native[k] ?? new Float32Array() }));
}

/**
 * @param {import("./engine.js").Engine} engine
 * @param {File[]} files
 * @param {{ id: string, name: string, sampling?: string, date: string, attribution: { it: string, en: string } }} identity
 * @param {{ onProgress: (p: Progress) => void, signal: AbortSignal }} hooks
 * @returns {Promise<Outcome>}
 */
export async function buildPrivateLibrary(engine, files, identity, hooks) {
  /** @type {Outcome} */
  const out = { built: null, imported: 0, unrecognized: 0, repeated: 0, skipped: [], warnings: [], cancelled: false, error: null };
  /** @type {Float32Array[]} */
  const rows = [];
  /** @type {Float32Array[]} */
  const natives = [];
  /** @type {object[]} */
  const index = [];
  const hashes = new Set();
  const units = unitsOf(files);
  let last = performance.now();
  for (const [i, unit] of units.entries()) {
    const { file } = unit;
    if (hooks.signal.aborted) return { ...out, cancelled: true };
    try {
      if (file.size > BUDGET.maxBytes) throw JSON.stringify({ error_key: "reader.limit_exceeded", params: { limit: "bytes", max: BUDGET.maxBytes } });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const hash = await digest(buffer);
      if (hashes.has(hash)) out.repeated++;
      else {
        hashes.add(hash);
        const base = file.name.replace(/\.[^.]*$/, "");
        const nam = unit.nam ? new Uint8Array(await unit.nam.arrayBuffer()) : new Uint8Array();
        if (unit.nam && unit.nam.size > BUDGET.maxBytes) throw JSON.stringify({ error_key: "reader.limit_exceeded", params: { limit: "bytes", max: BUDGET.maxBytes } });
        const items = extOf(file.name) === ".l01" ? shimadzuItems(engine, bytes, nam, base, out.warnings) : [{ title: base, resampled: Float32Array.from(engine.library_resample(file.name, bytes)), native: Float32Array.from(engine.library_native(file.name, bytes)) }];
        for (const item of items) {
          natives.push(item.native);
          rows.push(item.resampled);
          index.push({ id: `u${rows.length}`, form: "", substance: slug(item.title), names: { en: item.title }, classes: [], quality: "pass", provenance_type: "user_import" });
        }
      }
    } catch (e) {
      const notice = noticeOf(e);
      if (notice.key === "reader.unknown_format") out.unrecognized++;
      else out.skipped.push({ file: file.name, notice });
    }
    hooks.onProgress({ done: i + 1, total: units.length });
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

/**
 * Choose the files of ready-made private packages (`manifest.json`, `index.json`, `data.bin`, optional `native.bin`) and group them by the folder that holds them:
 * a whole folder of packages gives one group per package, the four files of one package chosen together give one group without a folder name.
 * @typedef {{ name: string, manifest?: File, index?: File, data?: File, native?: File }} PackageGroup
 * @param {File[]} files @returns {PackageGroup[]}
 */
export function groupPackages(files) {
  /** @type {Map<string, PackageGroup>} */
  const groups = new Map();
  const slots = /** @type {const} */ ({ "manifest.json": "manifest", "index.json": "index", "data.bin": "data", "native.bin": "native" });
  for (const file of files) {
    const slot = slots[/** @type {keyof typeof slots} */ (file.name)];
    if (!slot) continue;
    const parts = (file.webkitRelativePath || file.name).split("/");
    const dir = parts.slice(0, -1).join("/");
    const group = groups.get(dir) ?? { name: parts.length > 1 ? parts[parts.length - 2] : "" };
    group[slot] = file;
    groups.set(dir, group);
  }
  return [...groups.values()];
}

const PACKAGE_FILES = new Set(["manifest.json", "index.json", "data.bin", "native.bin"]);

/** Whether a file of a package is one the package format knows. @param {File} file @returns {boolean} */
export const isPackageFile = (file) => PACKAGE_FILES.has(file.name);

/**
 * What the chosen files are, from their content: ready-made library packages (a `manifest.json` of schema `ftir-library/1`), a Shimadzu library (`.L01`), or spectra.
 * @param {File[]} files
 * @returns {Promise<{ kind: "packages" | "shimadzu" | "spectra", files: File[] }>}
 */
export async function classify(files) {
  for (const file of files) {
    if (file.name !== "manifest.json") continue;
    try {
      if (JSON.parse(await file.text())?.schema === "ftir-library/1") return { kind: "packages", files };
    } catch {
      // not JSON: an ordinary file
    }
  }
  if (files.some((f) => extOf(f.name) === ".l01")) return { kind: "shimadzu", files };
  return { kind: "spectra", files };
}
