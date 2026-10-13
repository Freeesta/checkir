// @ts-check
/**
 * Private libraries live in the origin private file system (OPFS): the user's own spectra, in this browser only.
 * One directory per library under `checkir-libraries/`, with the three files of the package.
 * @typedef {{ id: string, manifest: string, index: string, data: Uint8Array }} StoredLibrary
 */
import { STORAGE_PREFIX } from "./appname.js";

const ROOT = `${STORAGE_PREFIX.replace(/\.$/, "")}-libraries`;
const FILES = ["manifest.json", "index.json", "data.bin"];

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
  const content = { "manifest.json": lib.manifest, "index.json": lib.index, "data.bin": lib.data };
  for (const name of FILES) {
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
      out.push({ id, manifest: text.decode(manifest), index: text.decode(index), data: new Uint8Array(/** @type {ArrayBuffer} */ (data)) });
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
