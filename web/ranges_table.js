// @ts-check
import { compareWith, effectiveChoice, matchSignature } from "./match.js";
import { LISTED } from "./results.js";
import { rangesOf } from "./ranges.js";
import { candidateKey, getState, resultOf, subscribe, update } from "./state.js";

/**
 * The candidate × region table: for the candidates of the shown result, r on the whole range and on every region of the choice,
 * one engine comparison per column (tens of milliseconds each). A candidate that is not among the first ten of a column has no value
 * there: the cell says so in words. Nothing is stored; a new choice, library set or spectrum recomputes it.
 */

/** Columns of the table for a choice: the whole range, then each region on its own. @param {import("./state.js").RangeChoice} choice @returns {import("./state.js").RangeTable["columns"]} */
export function columnsFor(choice) {
  if (choice.preset === "full") return [];
  return [{ id: "full", ranges: [[650, 3800]] }, ...rangesOf(choice).map((r, i) => ({ id: `r${i + 1}`, ranges: [r] }))];
}

/** r of each candidate in one comparison result. @param {any} data @param {string[]} keys @returns {Record<string, number | null>} */
function valuesOf(data, keys) {
  /** @type {Record<string, number | null>} */
  const out = {};
  for (const k of keys) out[k] = null;
  for (const c of data.candidates ?? []) if (candidateKey(c) in out) out[candidateKey(c)] = c.r_derivative;
  return out;
}

/** @param {string} code @param {string} sig @param {Partial<import("./state.js").RangeTable>} patch */
function store(code, sig, patch) {
  const s = getState();
  const old = s.rangeTable[code];
  const base = old && old.sig === sig ? old : { sig, columns: [], cells: {}, busy: true };
  update({ rangeTable: { ...s.rangeTable, [code]: { ...base, ...patch } } });
}

/** Compute the table of a spectrum, column after column (the table fills in as the columns arrive). @param {string} code @param {string} sig */
async function compute(code, sig) {
  const s = getState();
  const result = resultOf(s);
  const columns = columnsFor(effectiveChoice(s));
  if (!result || !columns.length) return;
  const keys = (result.data.candidates ?? []).slice(0, LISTED).map(candidateKey);
  store(code, sig, { columns, cells: {}, busy: true });
  for (const col of columns) {
    const json = await compareWith(code, col.id === "full" ? { range_preset: "full" } : { ranges: col.ranges });
    const now = getState();
    if (matchSignature(now) !== sig || resultOf(now)?.code !== code) return;
    const data = json ? JSON.parse(json) : null;
    const column = data && !data.error_key ? valuesOf(data, keys) : Object.fromEntries(keys.map((/** @type {string} */ k) => [k, null]));
    store(code, sig, { cells: { ...getState().rangeTable[code]?.cells, [col.id]: column } });
  }
  store(code, sig, { busy: false });
}

/** Start the table whenever the shown spectrum has a result for a region that is not the whole range. */
export function startRangeTable() {
  /** @type {Set<string>} */
  const started = new Set();
  subscribe((s) => {
    const r = resultOf(s);
    if (!r || !columnsFor(effectiveChoice(s)).length) return;
    const have = s.rangeTable[r.code];
    const key = `${r.code}#${r.sig}`;
    if ((have && have.sig === r.sig) || started.has(key)) return;
    started.add(key);
    compute(r.code, r.sig).finally(() => started.delete(key));
  });
}
