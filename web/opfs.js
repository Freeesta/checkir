// @ts-check
/**
 * Private libraries live in the origin private file system (OPFS): the user's own spectra, in this browser only.
 * One directory per library under `<prefix>-libraries/` (the prefix of appname.js), with the three files of the package.
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array, native?: Uint8Array }} StoredLibrary
 */
import { STORAGE_PREFIX } from "./appname.js";

const ROOT = `${STORAGE_PREFIX.replace(/\.$/, "")}-libraries`;
const FILES = ["manifest.json", "index.json", "data.bin"];
/** The spectra as the files gave them (for drawing); a package saved before it existed has none. */
const NATIVE = "native.bin";

/** Whether this browser can keep files for the page (Safari before 26 cannot write from the main thread). @returns {boolean} */
export function canStore() {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory) && typeof FileSystemFileHandle !== "undefined" && "createWritable" in FileSystemFileHandle.prototype;
}

/** @returns {Promise<FileSystemDirectoryHandle>} */
async function root() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });
}

/** @param {StoredLibrary} lib */
export async function saveLibrary(lib) {
  const dir = await (await root()).getDirectoryHandle(lib.id, { create: true });
  /** @type {Record<string, string | Uint8Array>} */
  const content = { "manifest.json": lib.manifest, "index.json": lib.index, "data.bin": lib.data, [NATIVE]: lib.native ?? new Uint8Array(0) };
  for (const name of lib.native ? [...FILES, NATIVE] : FILES) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(/** @type {BufferSource | string} */ (content[name]));
    await w.close();
  }
}

/** Every stored library; a directory that is incomplete is skipped (it is a cache: the user imports again). @returns {Promise<StoredLibrary[]>} */
export async function loadLibraries() {
  if (!canStore()) return [];
  const out = [];
  const top = await root();
  for await (const [id, handle] of /** @type {any} */ (top).entries()) {
    if (handle.kind !== "directory") continue;
    try {
      const [manifest, index, data] = await Promise.all(FILES.map(async (n) => (await (await handle.getFileHandle(n)).getFile()).arrayBuffer()));
      const text = new TextDecoder();
      const native = await (await handle.getFileHandle(NATIVE)).getFile().then((/** @type {File} */ f) => f.arrayBuffer()).catch(() => null);
      out.push({ id, manifest: text.decode(manifest), index: text.decode(index), data: new Uint8Array(/** @type {ArrayBuffer} */ (data)), ...(native ? { native: new Uint8Array(native) } : {}) });
    } catch {
      // incomplete package: ignored
    }
  }
  return out;
}

/** @param {string} id */
export async function removeStored(id) {
  if (!canStore()) return;
  try {
    await (await root()).removeEntry(id, { recursive: true });
  } catch {
    // already gone
  }
}
