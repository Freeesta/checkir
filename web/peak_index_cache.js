// @ts-check
/**
 * Cache of the peak index of each library (`peak-index/1`) in the origin private file system: one file per library, made by
 * the engine (`peak_index_export`) and checked by it on reading (library version, chain, thresholds). It is only a cache:
 * every failure here means "not there" and the worker builds the index again. Usable from a worker and from the page.
 */
import { APP_ID } from "./appname.js";

const ROOT = `${APP_ID}-cache`;
const DIR = "peak-index";

/** @returns {boolean} */
function available() {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);
}

/** @returns {Promise<FileSystemDirectoryHandle>} */
async function dir() {
  const top = await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });
  return top.getDirectoryHandle(DIR, { create: true });
}

/** @param {string} id @returns {string} file name of a library (ids are lowercase slugs) */
function fileOf(id) {
  return `${id.replace(/[^a-z0-9-]/g, "_")}.bin`;
}

/** @param {string} id @returns {Promise<Uint8Array | null>} the stored index, or null when there is none */
export async function readIndex(id) {
  if (!available()) return null;
  try {
    const handle = await (await dir()).getFileHandle(fileOf(id));
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

/** @param {string} id @param {Uint8Array} bytes @returns {Promise<boolean>} whether it was stored */
export async function writeIndex(id, bytes) {
  if (!available() || !bytes.length) return false;
  try {
    const handle = await (await dir()).getFileHandle(fileOf(id), { create: true });
    const sync = /** @type {any} */ (handle).createSyncAccessHandle;
    if (typeof sync === "function") {
      const access = await sync.call(handle);
      access.truncate(0);
      access.write(bytes, { at: 0 });
      access.flush();
      access.close();
    } else {
      const w = await handle.createWritable();
      await w.write(/** @type {BufferSource} */ (bytes));
      await w.close();
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {string} id */
export async function removeIndex(id) {
  if (!available()) return;
  try {
    await (await dir()).removeEntry(fileOf(id));
  } catch {
    // already gone
  }
}
