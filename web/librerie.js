// @ts-check
/**
 * The libraries of the page: the public packages named by the general manifest (`librerie/libraries.json`, cached by
 * the service worker so they work offline) and the private ones kept in OPFS. The spectra stay here, in memory; the state
 * holds only what the panel shows.
 * @typedef {import("./state.js").Notice} Notice
 * @typedef {import("./state.js").LibraryEntry} LibraryEntry
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array }} PackageFiles
 * @typedef {{ entry: LibraryEntry, rows: import("./nomi.js").IndexRow[], values: Float32Array }} Loaded
 */
import { buildNameIndex, searchNames } from "./nomi.js";
import { buildPrivateLibrary, noticeOf, slug, uniqueId } from "./importa.js";
import { canStore, loadLibraries, removeStored, saveLibrary } from "./opfs.js";
import { t } from "./i18n.js";
import { getState, update } from "./state.js";

/** Same numbers as `Limits::STANDARD` of the library crate. */
const LIMITS = { maxBytes: 256 * 1024 * 1024, maxSpectra: 50_000 };
const BASE = "librerie/";

/** @type {Map<string, Loaded>} */
const loaded = new Map();
/** @type {import("./nomi.js").NameEntry[] | null} */
let names = null;
/** @type {AbortController | null} */
let job = null;

/** @param {string} id @returns {Float32Array | null} spectra of a library, one after the other on the common grid */
export function libraryValues(id) {
  return loaded.get(id)?.values ?? null;
}

/** @param {string} id @returns {import("./nomi.js").IndexRow[] | null} the index rows of a library, in the order of its values */
export function libraryRows(id) {
  return loaded.get(id)?.rows ?? null;
}

/** Compounds whose name (or InChIKey) starts with the text, in the active libraries. @param {string} query @param {number} [limit] */
export function findNames(query, limit = 20) {
  names ??= buildNameIndex([...loaded.values()].filter((l) => l.entry.enabled).map((l) => ({ id: l.entry.id, rows: l.rows })));
  return searchNames(names, query, limit);
}

/** @param {Notice} notice */
function addNotice(notice) {
  const have = getState().libraryNotices;
  if (!have.some((n) => n.key === notice.key && JSON.stringify(n.params) === JSON.stringify(notice.params))) update({ libraryNotices: [...have, notice] });
}

function publish() {
  names = null;
  update({ libraries: [...loaded.values()].map((l) => l.entry) });
}

/**
 * Check a package with the engine and add it. Nothing partial is kept when the engine refuses it.
 * @param {import("./engine.js").Engine} engine @param {PackageFiles} files @param {boolean} enabled @returns {Notice | null}
 */
export function registerPackage(engine, files, enabled) {
  const checked = JSON.parse(engine.library_open(files.manifest, files.index, files.data, LIMITS.maxBytes, LIMITS.maxSpectra));
  if ("error_key" in checked) return noticeOf(checked);
  const bytes = files.data.byteOffset % 4 === 0 ? files.data : files.data.slice();
  const att = checked.attribution ?? {};
  loaded.set(files.id, {
    rows: JSON.parse(files.index).spectra,
    values: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
    entry: { id: files.id, version: checked.version, spectra: checked.n_spectra, license: checked.license, attribution: { it: att.it ?? null, en: att.en ?? "" }, private: checked.private === true, enabled },
  });
  publish();
  return null;
}

/** @param {string} path @returns {Promise<Uint8Array>} */
async function fetchBytes(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  return new Uint8Array(await res.arrayBuffer());
}

/** Public packages from the general manifest, then the private ones from OPFS. @param {import("./engine.js").Engine} engine */
export async function loadAllLibraries(engine) {
  try {
    const general = JSON.parse(new TextDecoder().decode(await fetchBytes(`${BASE}libraries.json`)));
    for (const lib of general.libraries ?? []) {
      if (!/^[a-z0-9-]+$/.test(String(lib.path))) continue;
      const [manifest, index, data] = await Promise.all(["manifest.json", "index.json", "data.bin"].map((f) => fetchBytes(`${BASE}${lib.path}/${f}`)));
      const text = new TextDecoder();
      const bad = registerPackage(engine, { id: String(lib.id), manifest: text.decode(manifest), index: text.decode(index), data: /** @type {Uint8Array} */ (data) }, lib.enabled !== false);
      if (bad) addNotice(bad);
    }
  } catch {
    addNotice({ key: "library.load_failed", params: {} });
  }
  try {
    for (const stored of await loadLibraries()) {
      const bad = registerPackage(engine, stored, true);
      if (bad) addNotice(bad);
    }
  } catch {
    addNotice({ key: "library.store_failed", params: {} });
  }
}

/** @param {string} id @param {boolean} on */
export function setEnabled(id, on) {
  const l = loaded.get(id);
  if (!l) return;
  l.entry = { ...l.entry, enabled: on };
  publish();
}

/** Forget a private library, in memory and in OPFS. Public ones cannot be removed (only switched off). @param {string} id */
export async function removePrivate(id) {
  if (!loaded.get(id)?.entry.private) return;
  await removeStored(id);
  loaded.delete(id);
  publish();
}

export function cancelImport() {
  job?.abort();
}

/**
 * Import the chosen JCAMP-DX files as one private library, with progress; nothing is stored unless it all worked.
 * @param {import("./engine.js").Engine | null} engine @param {File[]} files @param {string} name
 * @param {(notice: Notice) => void} say receives the summary to announce
 * @returns {Promise<void>}
 */
export async function importLibrary(engine, files, name, say) {
  if (!engine || job) return;
  job = new AbortController();
  const id = uniqueId(slug(name), new Set(loaded.keys()));
  update({ libraryNotices: [], libraryJob: { done: 0, total: files.length, name: id } });
  const identity = { id, name, date: new Date().toISOString().slice(0, 10), attribution: { it: "Importata dall'utente, resta in questo browser.", en: "Imported by the user, kept in this browser only." } };
  const out = await buildPrivateLibrary(engine, files, identity, { signal: job.signal, onProgress: (p) => update({ libraryJob: { ...p, name: id } }) });
  job = null;
  /** @type {Notice[]} */
  const notices = [];
  let stored = false;
  if (out.built && !out.cancelled) {
    const bad = registerPackage(engine, out.built, true);
    if (bad) notices.push(bad);
    else {
      stored = true;
      if (!canStore()) notices.push({ key: "library.import.no_storage", params: {} });
      else await saveLibrary(out.built).catch(() => notices.push({ key: "library.store_failed", params: {} }));
    }
  }
  /** @type {Notice | null} */
  let head = null;
  if (out.cancelled) head = { key: "library.import.cancelled", params: {} };
  else if (out.error) head = out.error;
  else if (!out.imported) head = { key: "library.import.none", params: {} };
  else if (stored) head = { key: "library.import.done", params: { name: id, ok: String(out.imported), skipped: String(out.skipped.length + out.ignored) } };
  const skipped = out.skipped.slice(0, 5).map((s) => ({ key: "library.import.skipped", params: { file: s.file, reason_key: s.notice.key, ...s.notice.params } }));
  const all = [...(head ? [head] : []), ...notices, ...skipped];
  update({ libraryJob: null, libraryNotices: all });
  if (all[0]) say(all[0]);
}

/** The library members of the page context. @param {import("./engine.js").Engine | null} engine @param {(text: string) => void} announce */
export function libraryActions(engine, announce) {
  return {
    importLibrary: (/** @type {File[]} */ files, /** @type {string} */ name) => importLibrary(engine, files, name, (n) => announce(t(n.key, n.params))),
    cancelImport,
    removeLibrary: (/** @type {string} */ id) => void removePrivate(id).then(() => announce(t("status.library_removed", { name: id }))),
    toggleLibrary: setEnabled,
  };
}
