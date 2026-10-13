// @ts-check
/**
 * Index of the names of the active libraries, to recall a compound by typing the start of its name (no accents, no case).
 * @typedef {{ key: string, name: string, lang: "it" | "en" | "key", library: string, spectrum: string, substance: string, classes: string[] }} NameEntry
 * @typedef {{ id: string, rows: IndexRow[] }} NamedLibrary
 * @typedef {{ id: string, substance: string, names: { it?: string, en: string }, classes: string[], inchikey?: string }} IndexRow
 */

/** Lower case, without accents or combining marks, single spaces. @param {string} s @returns {string} */
export function normalize(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** @param {NamedLibrary[]} libraries @returns {NameEntry[]} entries sorted by key */
export function buildNameIndex(libraries) {
  /** @type {NameEntry[]} */
  const out = [];
  for (const lib of libraries) {
    for (const r of lib.rows) {
      const base = { library: lib.id, spectrum: r.id, substance: r.substance, classes: r.classes };
      out.push({ ...base, key: normalize(r.names.en), name: r.names.en, lang: "en" });
      if (r.names.it) out.push({ ...base, key: normalize(r.names.it), name: r.names.it, lang: "it" });
      if (r.inchikey) out.push({ ...base, key: normalize(r.inchikey), name: r.inchikey, lang: "key" });
    }
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Entries whose key starts with the query, in key order, one per substance and library.
 * @param {NameEntry[]} index @param {string} query @param {number} [limit]
 * @returns {NameEntry[]}
 */
export function searchNames(index, query, limit = 20) {
  const q = normalize(query);
  if (!q) return [];
  let lo = 0;
  let hi = index.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (/** @type {NameEntry} */ (index[mid]).key < q) lo = mid + 1;
    else hi = mid;
  }
  const seen = new Set();
  /** @type {NameEntry[]} */
  const found = [];
  for (let i = lo; i < index.length && found.length < limit; i++) {
    const e = /** @type {NameEntry} */ (index[i]);
    if (!e.key.startsWith(q)) break;
    const id = `${e.library}/${e.substance}`;
    if (seen.has(id)) continue;
    seen.add(id);
    found.push(e);
  }
  return found;
}
