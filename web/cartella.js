// @ts-check
import { isReadable, openFiles } from "./files.js";
import { t } from "./i18n.js";
import { getState, update } from "./state.js";

/**
 * Watch a folder that the instrument software saves measurements in (File System Access API, read only).
 * Nothing is written, no instrument is commanded, nothing leaves the browser. The only thing that may be stored is a reference
 * to the folder itself (opt-in, see `saveRef`), never a file name or a content.
 * @typedef {{ kind: "file" | "directory", name: string, getFile: () => Promise<File>, entries: () => AsyncIterable<[string, FsHandle]> }} FsHandle
 * @typedef {{ stop: () => void, scan: () => Promise<number> }} Watcher
 */

/** Extensions of measurement files; the rest of the folder is not looked at. */
export const EXTENSIONS = [".ispd", ".dx", ".jdx", ".csv", ".txt"];
/** Scan period without a native observer, with one (safety net), and time after which an unreadable file is reported. */
export const POLL_MS = 2000;
export const SAFETY_MS = 30000;
export const GIVE_UP_MS = 30000;
/** At most this many measurements wait for an answer; older ones are dropped. */
export const MAX_OFFERS = 20;

/** @param {string} name */
const isMeasure = (name) => EXTENSIONS.some((e) => name.toLowerCase().endsWith(e));

/** Whether the browser can watch a folder (Chrome and Edge on a computer). @returns {boolean} */
export function folderSupported() {
  return typeof (/** @type {any} */ (window).showDirectoryPicker) === "function";
}

/** The measurement files at the first level of the folder, with a signature (size and modification time) of each. @param {FsHandle} dir @returns {Promise<Map<string, { handle: FsHandle, file: File, sig: string }>>} */
async function listFolder(dir) {
  const out = new Map();
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file" || !isMeasure(name)) continue;
    try {
      const file = await handle.getFile();
      out.set(name, { handle, file, sig: `${file.size}:${file.lastModified}` });
    } catch {
      // a file that vanished between the listing and the read: seen at the next scan if it is still there
    }
  }
  return out;
}

/**
 * Detect the files that appear or change after the watcher starts. The first scan only records what is already there (never opened,
 * never listed). A file is reported once, when its size and date stayed the same between two scans and `validate` can read it;
 * if it cannot be read within `giveUpMs` of its last change, `onUnreadable` says so once.
 * @param {FsHandle} dir
 * @param {{ validate: (file: File) => Promise<boolean>, onReady: (name: string, handle: FsHandle) => void, onUnreadable: (name: string) => void, onLost: () => void, now?: () => number, giveUpMs?: number }} hooks
 * @returns {Watcher}
 */
export function createWatcher(dir, hooks) {
  const now = hooks.now ?? Date.now;
  const giveUp = hooks.giveUpMs ?? GIVE_UP_MS;
  /** @type {Map<string, string>} */
  const handled = new Map();
  /** @type {Map<string, { sig: string, since: number }>} */
  const tracking = new Map();
  let first = true;
  let busy = false;
  let stopped = false;
  /** @param {string} name @param {{ handle: FsHandle, file: File, sig: string }} e */
  const follow = async (name, e) => {
    const seen = tracking.get(name);
    if (!seen || seen.sig !== e.sig) return void tracking.set(name, { sig: e.sig, since: now() });
    if (await hooks.validate(e.file)) {
      tracking.delete(name);
      handled.set(name, e.sig);
      hooks.onReady(name, e.handle);
    } else if (now() - seen.since >= giveUp) {
      tracking.delete(name);
      handled.set(name, e.sig);
      hooks.onUnreadable(name);
    }
  };
  /** @returns {Promise<number>} how many files are still waiting to be stable (the caller scans again soon) */
  async function scan() {
    if (busy || stopped) return 0;
    busy = true;
    try {
      const list = await listFolder(dir);
      if (first) {
        first = false;
        for (const [name, e] of list) handled.set(name, e.sig);
        return 0;
      }
      for (const [name, e] of list) if (handled.get(name) !== e.sig) await follow(name, e);
      for (const name of [...tracking.keys()]) if (!list.has(name)) tracking.delete(name);
      return tracking.size;
    } catch {
      stopped = true;
      hooks.onLost();
      return 0;
    } finally {
      busy = false;
    }
  }
  return { scan, stop: () => void (stopped = true) };
}

const DB = "checkir-folder";
const STORE = "ref";
const KEY = "watched";

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** @param {"readonly" | "readwrite"} mode @param {(s: IDBObjectStore) => IDBRequest} op @returns {Promise<any>} */
async function withStore(mode, op) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = op(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

/** Remember the folder handle (the reference to the folder only, under a fixed key). @param {FsHandle} handle */
export const saveRef = (handle) => withStore("readwrite", (s) => s.put(handle, KEY));
/** Forget the remembered folder and drop the database. */
export async function clearRef() {
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = r.onerror = r.onblocked = () => resolve(null);
  });
}
/** The remembered folder handle, or null. The database is never created just to look. @returns {Promise<FsHandle | null>} */
export async function loadRef() {
  try {
    const known = await indexedDB.databases();
    if (!known.some((d) => d.name === DB)) return null;
    return (await withStore("readonly", (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

/** @param {Partial<import("./state.js").FolderState>} patch */
function patch(patch) {
  update({ folder: { ...getState().folder, ...patch } });
}

/** @param {string} key @param {Record<string, string>} [params] */
const notice = (key, params = {}) => patch({ notice: { key, params } });

/**
 * The folder feature: state in `state.folder`, handles and timers here. Without the browser API only `pickLast` (a plain folder chooser) works.
 * @param {{ engine: import("./engine.js").Engine | null, announce: (text: string) => void }} deps
 * @returns {import("./actions.js").FolderCtx}
 */
export function createFolder({ engine, announce }) {
  /** @type {Map<string, FsHandle>} */
  const offered = new Map();
  /** @type {FsHandle | null} */
  let current = null;
  /** @type {FsHandle | null} */
  let saved = null;
  /** @type {Watcher | null} */
  let watcher = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {{ disconnect: () => void } | null} */
  let observer = null;
  let seq = 0;

  const stop = () => {
    watcher?.stop();
    if (timer) clearInterval(timer);
    observer?.disconnect();
    watcher = timer = observer = current = null;
    offered.clear();
    patch({ watching: false, folderName: null, offers: [], notice: null });
  };

  /** @param {string} id */
  const dropOffer = (id) => {
    offered.delete(id);
    patch({ offers: getState().folder.offers.filter((o) => o.id !== id) });
  };

  /** Open a measurement as any loaded file (new entry; nothing already open is replaced). @param {string} id */
  const openOffer = async (id) => {
    const handle = offered.get(id);
    if (!handle) return;
    dropOffer(id);
    try {
      await openFiles([await handle.getFile()], engine);
    } catch {
      return notice("err.folder.unreadable");
    }
    const s = getState();
    announce(s.fileError ? `${t("status.file_failed")} ${t(s.fileError.key, s.fileError.params)}` : t("status.file_loaded", { code: s.active ?? "" }));
  };

  /** Open at once only when nothing derived from a spectrum would be lost to the view; otherwise it stays an offer. */
  const canAutoOpen = () => getState().folder.auto && !getState().files.some((f) => f.parent !== null);

  /** @param {string} name @param {FsHandle} handle */
  const onReady = (name, handle) => {
    const id = String(++seq);
    offered.set(id, handle);
    const offers = [...getState().folder.offers, { id, name }];
    for (const old of offers.splice(0, Math.max(0, offers.length - MAX_OFFERS))) offered.delete(old.id);
    patch({ offers, notice: null });
    if (canAutoOpen()) openOffer(id);
    else announce(t("folder.status.new"));
  };

  /** @param {string} name */
  const onUnreadable = (name) => {
    notice("err.folder.busy", { name });
    announce(t("folder.status.busy"));
  };

  const onLost = () => {
    stop();
    notice("err.folder.lost");
    announce(t("err.folder.lost"));
  };

  /** Observe the folder when the browser can (then a slow scan is only a safety net); otherwise scan every 2 s. @param {FsHandle} dir @param {Watcher} w */
  function schedule(dir, w) {
    const rescan = async () => {
      if ((await w.scan()) > 0 && observer) setTimeout(rescan, POLL_MS);
    };
    timer = setInterval(rescan, POLL_MS);
    const Observer = /** @type {any} */ (window).FileSystemObserver;
    if (typeof Observer !== "function") return;
    try {
      const o = new Observer(() => rescan());
      o.observe(dir).then(() => {
        if (watcher !== w) return o.disconnect();
        observer = o;
        if (timer) clearInterval(timer);
        timer = setInterval(rescan, SAFETY_MS);
      }, () => {});
    } catch {
      // keep scanning every 2 s
    }
  }

  /** @param {FsHandle} dir */
  async function begin(dir) {
    stop();
    current = dir;
    const w = createWatcher(dir, { validate: (f) => isReadable(f, engine), onReady, onUnreadable, onLost });
    watcher = w;
    patch({ watching: true, folderName: dir.name, notice: null });
    if (getState().folder.remember) {
      await saveRef(dir).catch(() => {});
      saved = dir;
      patch({ saved: dir.name });
    }
    await w.scan();
    if (watcher === w) schedule(dir, w);
    announce(t("folder.status.on"));
  }

  /** @param {boolean} on */
  async function setRemember(on) {
    patch({ remember: on });
    if (on && current) {
      await saveRef(current).catch(() => {});
      saved = current;
      patch({ saved: current.name });
    } else if (!on) {
      saved = null;
      patch({ saved: null });
      await clearRef();
    }
  }

  patch({ supported: folderSupported() });
  loadRef().then((ref) => {
    saved = ref;
    if (ref) patch({ remember: true, saved: ref.name });
  });

  const hidden = document.createElement("input");
  hidden.type = "file";
  hidden.hidden = true;
  hidden.setAttribute("webkitdirectory", "");
  document.body.append(hidden);
  hidden.addEventListener("change", async () => {
    const chosen = [...(hidden.files ?? [])].filter((f) => f.webkitRelativePath.split("/").length === 2 && isMeasure(f.name));
    hidden.value = "";
    const latest = chosen.sort((a, b) => b.lastModified - a.lastModified)[0];
    if (!latest) return notice("err.folder.none");
    patch({ notice: null });
    await openFiles([latest], engine);
    announce(t("status.file_loaded", { code: getState().active ?? "" }));
  });

  return {
    choose: async () => {
      try {
        const dir = await /** @type {any} */ (window).showDirectoryPicker({ mode: "read" });
        await begin(dir);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) notice("err.folder.denied");
      }
    },
    resume: async () => {
      if (!saved) return;
      try {
        const answer = await /** @type {any} */ (saved).requestPermission({ mode: "read" });
        if (answer === "granted") await begin(saved);
        else notice("err.folder.denied");
      } catch {
        notice("err.folder.denied");
      }
    },
    stop: () => {
      stop();
      announce(t("folder.status.off"));
    },
    setRemember,
    setAuto: (on) => patch({ auto: on }),
    openOffer,
    ignoreOffer: dropOffer,
    pickLast: () => hidden.click(),
  };
}
