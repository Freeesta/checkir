// @ts-check
/**
 * The mixture search, worker side: it runs in `match.worker.js` right after a comparison, never on the page thread. The gate is the
 * peaks the best candidate leaves unexplained; when there are some, the whole pool of the active libraries goes to `miscele_analizza`
 * (thresholds and cuts embedded in the engine) and the answer is trimmed to what the page shows.
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

/**
 * Sample peaks against the given references (assignment of the engine, rules embedded): how many main peaks each reference explains
 * and how many main peaks nobody explains.
 * @param {any} mod @param {unknown} query the sample as the comparison got it
 * @param {Array<{ key: string, substance: string, form: string, library: string, lib: LibData, row: number }>} refs
 * @returns {{ unexplained: number, byKey: Record<string, number> } | null}
 */
export function assignAgainst(mod, query, refs) {
  const list = JSON.parse(mod.detect_peaks(JSON.stringify(query), ""));
  if (list.error_key) return null;
  const refSets = refs.map((r) => {
    const peaks = JSON.parse(mod.detect_peaks(JSON.stringify({ role: "sample", y_unit: "absorbance", wavenumber_cm1: axisOf(r.lib), y: curveOf(r.lib, r.row) }), ""));
    return { substance_id: r.key, form: r.form, library: r.library, version: null, peaks };
  });
  if (refSets.some((r) => r.peaks.error_key)) return null;
  const out = JSON.parse(mod.assign_peaks(JSON.stringify(list), JSON.stringify(refSets), "", ""));
  if (out.error_key) return null;
  const items = new Map((out.items ?? []).map((/** @type {any} */ i) => [i.peak_id, i]));
  /** @type {Record<string, number>} */
  const byKey = {};
  let unexplained = 0;
  for (const p of list.peaks) {
    const item = /** @type {any} */ (items.get(p.id));
    if (p.tier !== "main" || p.artifact || item?.state === "artifact") continue;
    const by = item?.explained_by;
    if (by) byKey[by.substance_id] = (byKey[by.substance_id] ?? 0) + 1;
    else if (item?.state !== "minor") unexplained++;
  }
  return { unexplained, byKey };
}

/** @param {Map<string, LibData>} libs @param {string} id @param {string} rowId @returns {{ lib: LibData, row: number } | null} */
function find(libs, id, rowId) {
  const lib = libs.get(id);
  const row = lib ? lib.rows.findIndex((r) => r.id === rowId) : -1;
  return lib && row >= 0 ? { lib, row } : null;
}

/** The pool of the active libraries as the engine's JSON input text. @param {Map<string, LibData>} libs @param {string[]} ids @param {unknown} query @returns {string} */
function inputText(libs, ids, query) {
  /** @type {string[]} */
  const items = [];
  for (const id of ids) {
    const lib = libs.get(id);
    if (!lib) continue;
    const axis = numbers(axisOf(lib));
    lib.rows.forEach((r, i) => items.push(`{"id":${JSON.stringify(`${id}/${r.id}`)},"substance":${JSON.stringify(r.substance ?? "")},"name":${JSON.stringify(r.names.en)},"library":${JSON.stringify(id)},"form":${JSON.stringify(r.form ?? "")},"y_unit":"absorbance","wavenumber_cm1":${axis},"y":${numbers(curveOf(lib, i))}}`));
  }
  return `{"sample":${JSON.stringify(query)},"candidates":[${items.join(",")}]}`;
}

/**
 * The mixture proposal for one comparison, or null when there is none to make (nothing unexplained, fewer than two components, an engine error).
 * @param {any} mod @param {Map<string, LibData>} libs @param {string[]} ids libraries searched @param {unknown} query @param {any} result the comparison
 * @returns {object | null} components (id, library, row, name, contribution, explained), unexplained, alerts
 */
export function mixtureProposal(mod, libs, ids, query, result) {
  const top = result?.candidates?.[0];
  const topAt = top && find(libs, top.library, top.spectrum_id);
  if (!topAt) return null;
  const gate = assignAgainst(mod, query, [{ key: "top", substance: top.substance ?? "", form: top.form ?? "", library: top.library, ...topAt }]);
  if (!gate || gate.unexplained === 0) return null;
  const answer = JSON.parse(mod.miscele_analizza(inputText(libs, ids, query), "", ""));
  if (answer.error_key) return null;
  const chosen = (answer.components ?? []).filter((/** @type {any} */ c) => c.status === "proposed" && !c.variant_of);
  if (chosen.length < 2) return null;
  const refs = chosen.map((/** @type {any} */ c) => {
    const row = c.id.slice(c.library.length + 1);
    return { key: c.id, substance: c.substance ?? "", form: libs.get(c.library)?.rows.find((r) => r.id === row)?.form ?? "", library: c.library, ...find(libs, c.library, row) };
  });
  if (refs.some((/** @type {any} */ r) => !r.lib)) return null;
  const counts = assignAgainst(mod, query, refs);
  return {
    components: chosen.map((/** @type {any} */ c) => ({ id: c.id.slice(c.library.length + 1), library: c.library, name: c.name, substance: c.substance, is_cut: c.is_cut, contribution: c.contribution, explained: counts?.byKey[c.id] ?? null })),
    unexplained: (answer.unexplained_peaks ?? []).length,
    unexplained_variance_share: answer.unexplained_variance_share,
    alerts: answer.alerts ?? [],
  };
}
