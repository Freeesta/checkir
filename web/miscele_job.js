// @ts-check
/**
 * The mixture search, worker side: it runs in `match.worker.js` right after a comparison, never on the page thread. Only orchestration:
 * the whole pool of the active libraries goes to `miscele_analizza` (thresholds, cuts and the gate of the proposal live in the engine)
 * and the answer is trimmed to what the page shows.
 * @typedef {{ rows: Array<{ id: string, substance?: string, form?: string, names: { it?: string, en: string } }>, values: Float32Array, n: number, from: number, step: number }} LibData
 */

/** @param {LibData} lib @param {number} i @returns {number[]} the i-th spectrum of the library on its grid */
function curveOf(lib, i) {
  return Array.from(lib.values.subarray(i * lib.n, (i + 1) * lib.n));
}

/** @param {LibData} lib @returns {number[]} */
function axisOf(lib) {
  return Array.from({ length: lib.n }, (_, i) => lib.from + lib.step * i);
}

/** Numbers as short JSON text (6 significant digits, absent point = null): the pool is large. @param {number[]} v @returns {string} */
function numbers(v) {
  return `[${v.map((x) => (Number.isFinite(x) ? String(Number(x.toPrecision(6))) : "null")).join(",")}]`;
}

/** The candidates of one held library as JSON text, made once per library version (the search runs after every comparison). @type {WeakMap<LibData, string>} */
const poolText = new WeakMap();

/** @param {string} id @param {LibData} lib @returns {string} */
function libraryText(id, lib) {
  const known = poolText.get(lib);
  if (known !== undefined) return known;
  const axis = numbers(axisOf(lib));
  const text = lib.rows.map((r, i) => `{"id":${JSON.stringify(`${id}/${r.id}`)},"substance":${JSON.stringify(r.substance ?? "")},"name":${JSON.stringify(r.names.en)},"library":${JSON.stringify(id)},"form":${JSON.stringify(r.form ?? "")},"y_unit":"absorbance","wavenumber_cm1":${axis},"y":${numbers(curveOf(lib, i))}}`).join(",");
  poolText.set(lib, text);
  return text;
}

/** The pool of the active libraries as the engine's JSON input text. @param {Map<string, LibData>} libs @param {string[]} ids @param {unknown} query @returns {string} */
function inputText(libs, ids, query) {
  const parts = ids.flatMap((id) => {
    const lib = libs.get(id);
    return lib && lib.rows.length ? [libraryText(id, lib)] : [];
  });
  return `{"sample":${JSON.stringify(query)},"candidates":[${parts.join(",")}]}`;
}

/** A component of the engine as the page keeps it (row id without the library prefix). @param {any} c @returns {object} */
function part(c) {
  return { id: c.id.slice(c.library.length + 1), library: c.library, name: c.name, substance: c.substance, is_cut: c.is_cut, contribution: c.contribution, explained: c.explained_peaks ?? null, minor: c.minor === true };
}

/**
 * The mixture proposal for one comparison, or null when the engine sees no mixture (status `none`) or fails. A rejected proposal
 * carries no component, only the reason the engine gives (`rejected`).
 * @param {any} mod @param {Map<string, LibData>} libs @param {string[]} ids libraries searched @param {unknown} query
 * @returns {object | null} components (id, library, name, contribution, explained, minor), rejected, unexplained, alerts
 */
export function mixtureProposal(mod, libs, ids, query) {
  const answer = JSON.parse(mod.miscele_analizza(inputText(libs, ids, query), "", ""));
  const verdict = answer.proposal;
  if (answer.error_key || !verdict || verdict.status === "none") return null;
  const all = answer.components ?? [];
  const named = all.find((/** @type {any} */ c) => c.id === verdict.component);
  return {
    components: verdict.status === "proposed" ? all.filter((/** @type {any} */ c) => c.status === "proposed" && !c.variant_of).map(part) : [],
    rejected: verdict.status === "rejected" ? { reason: verdict.reason, component: named ? part(named) : null } : null,
    unexplained: (answer.unexplained_peaks ?? []).length,
    unexplained_variance_share: answer.unexplained_variance_share,
    alerts: answer.alerts ?? [],
  };
}
