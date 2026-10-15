// @ts-check
/**
 * The libraries of the page: the public packages named by the general manifest (`librerie/libraries.json`; the files are
 * asked with `?v=<version>` so the service worker keeps them for good) and the private ones kept in OPFS. A public library
 * is downloaded only while it is on (a switched-off one costs its small manifest, for the panel). The spectra stay here,
 * in memory; the state holds only what the panel shows.
 * @typedef {import("./state.js").Notice} Notice
 * @typedef {import("./state.js").LibraryEntry} LibraryEntry
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array, native?: Uint8Array }} PackageFiles
 * @typedef {{ data: Float32Array, at: number[] }} Native the spectra as the files give them: float32 records `[points, resolution_cm1 or NaN, x…, y…]`, `at` = start of each record
 * @typedef {{ entry: LibraryEntry, rows: import("./nomi.js").IndexRow[], values: Float32Array, native: Native | null }} Loaded
 */
import { buildNameIndex, searchNames } from "./nomi.js";
import { buildPrivateLibrary, groupPackages, isPackageFile, noticeOf, slug, uniqueId } from "./importa.js";
import { canStore, loadLibraries, removeStored, saveLibrary } from "./opfs.js";
import { removeIndex } from "./peak_index_cache.js";
import { currentLang, t } from "./i18n.js";
import { forgetPref, getState, readPref, update, writePref } from "./state.js";

/** Same numbers as `Limits::STANDARD` of the library crate. */
const LIMITS = { maxBytes: 256 * 1024 * 1024, maxSpectra: 50_000 };
const BASE = "librerie/";
/** Preference holding the name the user gave to a private library (the id never changes). */
const LABEL = "libname.";
/** Preference holding the switch of a library (`1` on, `0` off) when it differs from the default of the general manifest. */
const SWITCH = "libsw.";

/** @type {Map<string, Loaded>} */
const loaded = new Map();
/** Public packages named by the general manifest: where they are, their version for the URLs and their default switch. @type {Map<string, { path: string, v: string, enabled: boolean }>} */
const listed = new Map();
/** Libraries being downloaded now. @type {Set<string>} */
const fetching = new Set();
/** @type {import("./nomi.js").NameEntry[] | null} */
let names = null;
/** @type {AbortController | null} */
let job = null;

/** @param {string} id @returns {Float32Array | null} spectra of a library, one after the other on the common grid */
export function libraryValues(id) {
  return loaded.get(id)?.values ?? null;
}

/** The name of a library row in the active language (rows, alerts and mixtures all name a substance this way); without the row, the name the result carries. @param {{ library: string, spectrum_id: string, display_name: string }} c @returns {string} */
export function rowName(c) {
  const row = libraryRows(c.library)?.find((r) => r.id === c.spectrum_id);
  return row ? (row.names[currentLang() === "it" ? "it" : "en"] ?? row.names.en) : c.display_name;
}

/** @param {string} id @returns {import("./nomi.js").IndexRow[] | null} the index rows of a library, in the order of its values */
export function libraryRows(id) {
  return loaded.get(id)?.rows ?? null;
}

/**
 * The spectrum of a library exactly as its file gives it (points, order and nominal resolution), or null when this package
 * has no such copy (a private library imported before it existed: import it again). The resampled values are for the calculation only.
 * @param {string} id @param {string} spectrumId
 * @returns {{ wavenumber_cm1: number[], y: number[], y_unit: string, resolutionCm1: number | null } | null}
 */
export function libraryOriginal(id, spectrumId) {
  const lib = loaded.get(id);
  const i = lib?.rows.findIndex((r) => r.id === spectrumId) ?? -1;
  if (!lib?.native || i < 0) return null;
  const { data, at } = lib.native;
  const n = data[at[i]];
  const resolution = data[at[i] + 1];
  const from = at[i] + 2;
  return { wavenumber_cm1: Array.from(data.subarray(from, from + n)), y: Array.from(data.subarray(from + n, from + 2 * n)), y_unit: "Absorbance", resolutionCm1: Number.isFinite(resolution) ? resolution : null };
}

/** Where each record starts; null when the file does not hold exactly one record per spectrum. @param {Uint8Array | undefined} bytes @param {number} count @returns {Native | null} */
function parseNative(bytes, count) {
  if (!bytes || bytes.byteLength % 4 !== 0 || !bytes.byteLength) return null;
  const data = new Float32Array((bytes.byteOffset % 4 === 0 ? bytes : bytes.slice()).buffer, bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0, bytes.byteLength / 4);
  const at = [];
  for (let pos = 0; pos < data.length; pos += 2 + 2 * data[pos]) {
    if (!(data[pos] >= 0)) return null;
    at.push(pos);
  }
  const end = at.length ? at[at.length - 1] + 2 + 2 * data[at[at.length - 1]] : 0;
  return at.length === count && end === data.length ? { data, at } : null;
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

/** The state entry of a library from its manifest. @param {string} id @param {any} manifest @param {boolean} enabled @param {boolean} isLoaded @returns {LibraryEntry} */
function entryOf(id, manifest, enabled, isLoaded) {
  const att = manifest.attribution ?? {};
  const isPrivate = manifest.private === true;
  return { id, label: isPrivate ? readPref(LABEL + id) || id : id, version: manifest.version, spectra: manifest.n_spectra, license: manifest.license, attribution: { it: att.it ?? null, en: att.en ?? "" }, terms: manifest.terms ? { it: manifest.terms.it ?? null, en: manifest.terms.en ?? "" } : null, private: isPrivate, enabled, sampling: typeof manifest.sampling === "string" ? manifest.sampling : null, loaded: isLoaded };
}

/** A public library that is off: only its manifest is here (name, version, licence for the panel), no spectra. @param {string} id @param {string} manifest */
function registerListed(id, manifest) {
  const meta = JSON.parse(manifest);
  loaded.set(id, { rows: [], values: new Float32Array(0), native: null, entry: entryOf(id, meta, false, false) });
}

/** Whether a library is on: the remembered switch, else the default of the general manifest (private libraries: on). @param {{ id: string, enabled?: boolean }} lib @returns {boolean} */
function enabledFor(lib) {
  const saved = readPref(SWITCH + lib.id);
  return saved === "1" ? true : saved === "0" ? false : lib.enabled !== false;
}

/**
 * Check a package with the engine and add it. Nothing partial is kept when the engine refuses it.
 * @param {import("./engine.js").Engine} engine @param {PackageFiles} files @param {boolean} enabled @param {boolean} [announce] false while several packages load together: the caller publishes once @returns {Notice | null}
 */
export function registerPackage(engine, files, enabled, announce = true) {
  const checked = JSON.parse(engine.library_open(files.manifest, files.index, files.data, LIMITS.maxBytes, LIMITS.maxSpectra));
  if ("error_key" in checked) return noticeOf(checked);
  const bytes = files.data.byteOffset % 4 === 0 ? files.data : files.data.slice();
  loaded.set(files.id, {
    rows: JSON.parse(files.index).spectra,
    values: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
    native: parseNative(files.native, checked.n_spectra),
    entry: entryOf(files.id, checked, enabled, true),
  });
  if (announce) publish();
  return null;
}

/** @param {string} path @returns {Promise<Uint8Array>} */
async function fetchBytes(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  return new Uint8Array(await res.arrayBuffer());
}

/** @param {{ path: string, v: string }} lib @param {string} file @returns {string} the URL of a package file; `v` changes with the content, so the cached copy is always the right one */
function packageUrl(lib, file) {
  return `${BASE}${lib.path}/${file}?v=${lib.v}`;
}

/** The files of a public package (the optional `native.bin` may be missing). @param {string} id @param {{ path: string, v: string }} lib @param {string} manifestText @returns {Promise<PackageFiles>} */
async function fetchPackage(id, lib, manifestText) {
  const [index, data] = await Promise.all(["index.json", "data.bin"].map((f) => fetchBytes(packageUrl(lib, f))));
  const native = await fetchBytes(packageUrl(lib, "native.bin")).catch(() => undefined);
  return { id, manifest: manifestText, index: new TextDecoder().decode(index), data: /** @type {Uint8Array} */ (data), ...(native ? { native } : {}) };
}

/** Public packages from the general manifest (spectra only for the libraries that are on), then the private ones from OPFS. @param {import("./engine.js").Engine} engine */
export async function loadAllLibraries(engine) {
  try {
    const general = JSON.parse(new TextDecoder().decode(await fetchBytes(`${BASE}libraries.json`)));
    for (const item of general.libraries ?? []) {
      if (!/^[a-z0-9-]+$/.test(String(item.path))) continue;
      const id = String(item.id);
      const lib = { path: String(item.path), v: String(item.v ?? ""), enabled: item.enabled !== false };
      listed.set(id, lib);
      try {
        const manifest = new TextDecoder().decode(await fetchBytes(packageUrl(lib, "manifest.json")));
        if (!enabledFor(item)) registerListed(id, manifest);
        else {
          const bad = registerPackage(engine, await fetchPackage(id, lib, manifest), true, false);
          if (bad) addNotice(bad);
        }
      } catch {
        addNotice({ key: "library.load_failed", params: {} }); // one library that cannot be read never hides the others
      }
    }
  } catch {
    addNotice({ key: "library.load_failed", params: {} });
  }
  try {
    for (const stored of await loadLibraries()) {
      const bad = registerPackage(engine, stored, enabledFor({ id: stored.id }), false);
      if (bad) addNotice(bad);
    }
  } catch {
    addNotice({ key: "library.store_failed", params: {} });
  }
  publish(); // one state change for all the libraries: the first comparison never runs on a part of them
}

/** @param {string} id @returns {string} the name shown for a library: the one the user gave a private library, else its id */
export function libraryLabel(id) {
  return loaded.get(id)?.entry.label ?? id;
}

/** Give a private library another name (saved in this browser); an empty name goes back to the id. @param {string} id @param {string} name */
export function renameLibrary(id, name) {
  const l = loaded.get(id);
  if (!l?.entry.private) return;
  const label = name.trim().slice(0, 60);
  if (label && label !== id) writePref(LABEL + id, label);
  else forgetPref(LABEL + id);
  l.entry = { ...l.entry, label: label || id };
  publish();
}

/** Remember the switch of a library only when it differs from the default (private libraries: on). @param {string} id @param {boolean} on */
function rememberSwitch(id, on) {
  if (on === (listed.get(id)?.enabled ?? true)) forgetPref(SWITCH + id);
  else writePref(SWITCH + id, on ? "1" : "0");
}

/** Switch a library on or off; a public one that was never downloaded is fetched first (progress in `libraryJob`). @param {import("./engine.js").Engine | null} engine @param {string} id @param {boolean} on @returns {Promise<void>} */
export async function setEnabled(engine, id, on) {
  const l = loaded.get(id);
  if (!l || fetching.has(id)) return;
  const site = listed.get(id);
  if (on && l.entry.loaded === false && site && engine) {
    fetching.add(id);
    update({ libraryJob: { done: 0, total: 1, name: id } });
    try {
      const bad = registerPackage(engine, await fetchPackage(id, site, new TextDecoder().decode(await fetchBytes(packageUrl(site, "manifest.json")))), true, false);
      if (bad) throw new Error(bad.key);
    } catch {
      addNotice({ key: "library.load_failed", params: {} });
      on = false;
    }
    fetching.delete(id);
    update({ libraryJob: null });
  }
  const now = loaded.get(id);
  if (!now) return;
  now.entry = { ...now.entry, enabled: on };
  rememberSwitch(id, on);
  publish();
}

/** Forget a private library, in memory and in OPFS. Public ones cannot be removed (only switched off). @param {string} id */
export async function removePrivate(id) {
  if (!loaded.get(id)?.entry.private) return;
  await removeStored(id);
  await removeIndex(id);
  forgetPref(LABEL + id);
  forgetPref(SWITCH + id);
  loaded.delete(id);
  publish();
}

export function cancelImport() {
  job?.abort();
}

/**
 * Import the chosen files as one private library, with progress; nothing is stored unless it all worked.
 * @param {import("./engine.js").Engine | null} engine @param {File[]} files @param {string} name @param {string} sampling how the spectra were measured (`unknown` = not said)
 * @param {(notice: Notice) => void} say receives the summary to announce
 * @returns {Promise<void>}
 */
export async function importLibrary(engine, files, name, sampling, say) {
  if (!engine || job) return;
  job = new AbortController();
  const id = uniqueId(slug(name), new Set(loaded.keys()));
  update({ libraryNotices: [], libraryJob: { done: 0, total: files.length, name: id } });
  const identity = { id, name, sampling, date: new Date().toISOString().slice(0, 10), attribution: { it: "Importata dall'utente, resta in questo browser.", en: "Imported by the user, kept in this browser only." } };
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
  else if (stored) head = { key: "library.import.done", params: { name: id, ok: String(out.imported), skipped: String(out.skipped.length + out.repeated) } };
  const skipped = out.skipped.slice(0, 5).map((s) => ({ key: "library.import.skipped", params: { file: s.file, reason_key: s.notice.key, ...s.notice.params } }));
  const unknown = out.unrecognized ? [{ key: out.unrecognized === 1 ? "library.import.unrecognized_one" : "library.import.unrecognized_many", params: { count: String(out.unrecognized) } }] : [];
  const all = [...(head ? [head] : []), ...notices, ...(out.imported ? out.warnings : []), ...unknown, ...skipped];
  update({ libraryJob: null, libraryNotices: all });
  if (all[0]) say(all[0]);
}

/**
 * Load ready-made private packages (`ftir-library/1` with `private: true`, e.g. a folder of packages) in one go: each is checked by the engine,
 * kept in OPFS and added; a package with the id of a private library already here replaces it (loading again updates). Nothing leaves the browser.
 * @param {import("./engine.js").Engine | null} engine @param {File[]} files @param {(notice: Notice) => void} say receives the summary to announce
 * @returns {Promise<void>}
 */
export async function importPackages(engine, files, say) {
  if (!engine || job) return;
  job = new AbortController();
  const groups = groupPackages(files);
  /** @type {Notice[]} */
  const notices = [];
  const taken = new Set([...loaded].filter(([, l]) => !l.entry.private).map(([id]) => id));
  const text = new TextDecoder();
  let ok = 0;
  let noStorage = false;
  for (const g of groups) {
    const name = g.name || "?";
    if (!g.manifest || !g.index || !g.data) {
      notices.push({ key: "library.package.incomplete", params: { name } });
      continue;
    }
    try {
      if (g.data.size > LIMITS.maxBytes) throw JSON.stringify({ error_key: "reader.limit_exceeded", params: { limit: "bytes", max: LIMITS.maxBytes } });
      const [manifest, index, data, native] = await Promise.all([g.manifest.text(), g.index.text(), g.data.arrayBuffer(), g.native?.arrayBuffer()]);
      const meta = JSON.parse(manifest);
      if (meta.private !== true) {
        notices.push({ key: "library.package.not_private", params: { name } });
        continue;
      }
      const id = uniqueId(slug(g.name || String(meta.name ?? "")), taken);
      taken.add(id);
      const had = loaded.has(id);
      const pkg = { id, manifest, index, data: new Uint8Array(data), ...(native ? { native: new Uint8Array(native) } : {}) };
      const bad = registerPackage(engine, pkg, enabledFor({ id }), false);
      if (bad) {
        notices.push({ key: "library.import.skipped", params: { file: name, reason_key: bad.key, ...bad.params } });
        continue;
      }
      ok++;
      if (had) await removeIndex(id);
      if (!canStore()) noStorage = true;
      else {
        await removeStored(id);
        await saveLibrary(pkg).catch(() => notices.push({ key: "library.store_failed", params: {} }));
      }
    } catch (e) {
      const notice = noticeOf(e);
      notices.push({ key: "library.import.skipped", params: { file: name, reason_key: notice.key, ...notice.params } });
    }
  }
  job = null;
  publish();
  /** @type {Notice} */
  const head = ok ? { key: "library.package.done", params: { n: String(ok) } } : { key: "library.package.none", params: {} };
  const strange = files.filter((f) => !isPackageFile(f)).length;
  const unknown = strange ? [{ key: strange === 1 ? "library.import.unrecognized_one" : "library.import.unrecognized_many", params: { count: String(strange) } }] : [];
  const all = [head, ...(noStorage ? [{ key: "library.import.no_storage", params: {} }] : []), ...notices, ...unknown];
  update({ libraryNotices: all });
  say(head);
}

/** The library members of the page context. @param {import("./engine.js").Engine | null} engine @param {(text: string) => void} announce */
export function libraryActions(engine, announce) {
  return {
    importLibrary: (/** @type {File[]} */ files, /** @type {string} */ name, /** @type {string} */ sampling) => importLibrary(engine, files, name, sampling, (n) => announce(t(n.key, n.params))),
    importPackages: (/** @type {File[]} */ files) => importPackages(engine, files, (n) => announce(t(n.key, n.params))),
    cancelImport,
    renameLibrary: (/** @type {string} */ id, /** @type {string} */ name) => renameLibrary(id, name),
    removeLibrary: (/** @type {string} */ id) => void removePrivate(id).then(() => announce(t("status.library_removed", { name: id }))),
    toggleLibrary: (/** @type {string} */ id, /** @type {boolean} */ on) => setEnabled(engine, id, on),
  };
}
