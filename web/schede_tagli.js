// @ts-check
// What the program computes about the cuts of a sheet (never written in the sheet): is there a spectrum for the cut in a public library, in an active library of
// this browser, and is it among the components or the chosen candidates of the spectrum shown.
import { libraryRows } from "./librerie.js";
import { normalize } from "./nomi.js";
import { sheetIndex, sheetKey } from "./schede.js";

/** @typedef {{ local: Set<string>, found: Set<string> }} CutContext keys (names and InChIKeys, normalized) of the active libraries and of what was found in the sample */

/** @param {Iterable<string | undefined | null>} names @returns {string[]} */
function keysOf(names) {
  const out = new Set();
  for (const n of names) if (n) out.add(normalize(n)), out.add(sheetKey(n));
  out.delete("");
  return [...out];
}

/** @type {{ sig: string, keys: Set<string> } | null} */
let memo = null;

/** Keys of every row of the active libraries; rebuilt only when the set of libraries changes. @param {string[]} libraryIds @returns {Set<string>} */
function libraryKeys(libraryIds) {
  const sig = libraryIds.join("|");
  if (memo?.sig === sig) return memo.keys;
  const keys = new Set();
  for (const id of libraryIds) {
    for (const r of libraryRows(id) ?? []) for (const k of keysOf([...Object.values(r.names), r.substance, r.inchikey])) keys.add(k);
  }
  memo = { sig, keys };
  return keys;
}

/**
 * The context of the cuts for one sample.
 * @param {string[]} libraryIds the active libraries @param {any[]} found components of the mixture and chosen candidates at level 1–3 (library rows or components)
 * @returns {CutContext}
 */
export function cutContext(libraryIds, found) {
  const keys = found.flatMap((c) => {
    const row = c.library ? libraryRows(c.library)?.find((r) => r.id === (c.spectrum_id ?? c.id)) : undefined;
    return keysOf([c.display_name, c.name, c.substance, ...Object.values(row?.names ?? {}), row?.inchikey]);
  });
  return { local: libraryKeys(libraryIds), found: new Set(keys) };
}

/** @param {string} cutId @param {CutContext} ctx @returns {{ public: boolean, local: boolean, found: boolean }} */
export function cutStatus(cutId, ctx) {
  const info = sheetIndex().cuts[cutId];
  if (!info) return { public: false, local: false, found: false };
  const has = (/** @type {Set<string>} */ set) => info.keys.some((k) => set.has(k));
  return { public: info.public, local: has(ctx.local), found: has(ctx.found) };
}
