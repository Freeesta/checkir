// @ts-check
import { addResidual, spectrumOf } from "./files.js";
import { currentLang, t } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { EXCLUDED_CM1, libraryCurve } from "./match.js";
import { correlations, pairs, scaleFactor } from "./recall_math.js";
import { activeFile, getState, resultOf, update } from "./state.js";
import { proposedFactor, residualAt } from "./subtract.js";

/**
 * Recalled references: up to three compounds taken from the libraries to look at beside the shown spectrum (overlaid, offset or as a
 * difference), with the numbers that say how far each is from the sample. Everything is in memory; a difference becomes a residual only on request.
 */

export const MAX_REFS = 3;

/**
 * What the chart and the panel need for the shown spectrum.
 * `rank` is the position in the comparison of this spectrum (null = not among the most similar, undefined = no comparison yet); `first` the r of the first candidate.
 * @typedef {{ ref: import("./state.js").Recalled, name: string, k: number, rSpectrum: number | null, rDerivative: number | null, rank: number | null | undefined, first: number | null }} RecallRow
 * @typedef {{ rows: RecallRow[], curves: Array<{ spectrum: import("./spectrum.js").Spectrum }>, difference: { spectrum: import("./spectrum.js").Spectrum, k: number, name: string } | null, error: import("./state.js").Notice | null }} RecallView
 */

/** @type {{ key: string, value: RecallView } | null} */
let cached = null;
/** @type {(text: string) => void} */
let say = () => {};

/** @param {import("./state.js").Recalled} ref @returns {string} the compound's name in the active language */
export function recalledName(ref) {
  const row = libraryRows(ref.library)?.find((r) => r.id === ref.spectrumId);
  return row ? (row.names[currentLang() === "it" ? "it" : "en"] ?? row.names.en) : ref.spectrumId;
}

/** @param {import("./state.js").Recalled} a @param {import("./state.js").Recalled} b @returns {boolean} */
const same = (a, b) => a.library === b.library && a.spectrumId === b.spectrumId;

/** @param {import("./state.js").AppState} s @returns {RecallView} */
function compute(s) {
  const file = activeFile(s);
  const sample = file ? spectrumOf(file.code) : undefined;
  /** @type {RecallView} */
  const view = { rows: [], curves: [], difference: null, error: null };
  if (!file || !sample) return view;
  const candidates = resultOf(s)?.data.candidates ?? [];
  const first = candidates.length ? candidates[0].r_derivative : null;
  for (const ref of s.recall.refs) {
    const curve = libraryCurve(ref.library, ref.spectrumId);
    if (!curve) continue;
    const k = scaleFactor(s.recall.scale, pairs(sample, curve, EXCLUDED_CM1));
    const r = correlations(sample, curve, EXCLUDED_CM1);
    const at = candidates.findIndex((/** @type {any} */ c) => c.library === ref.library && c.spectrum_id === ref.spectrumId);
    const rank = resultOf(s) ? (at >= 0 ? candidates[at].rank : null) : undefined;
    view.rows.push({ ref, name: recalledName(ref), k, rSpectrum: r.spectrum, rDerivative: r.derivative, rank, first });
    view.curves.push({ spectrum: { wavenumber_cm1: curve.wavenumber_cm1, y: curve.y.map((v) => v * k), y_unit: "Absorbance" } });
  }
  if (s.recall.mode === "difference") view.difference = differenceFor(s, file.code, view);
  return view;
}

/** The difference sample − k·reference for the current reference, with the engine's proposed k and its own baseline. @param {import("./state.js").AppState} s @param {string} code @param {RecallView} view @returns {RecallView["difference"]} */
function differenceFor(s, code, view) {
  const row = view.rows[Math.min(s.recall.current, view.rows.length - 1)];
  if (!row) return null;
  const f = proposedFactor(code, row.ref.library, row.ref.spectrumId);
  const res = "error" in f ? f : residualAt(code, row.ref.library, row.ref.spectrumId, f.proposed);
  if ("error" in res) {
    view.error = res.error;
    return null;
  }
  if ("error" in f) return null;
  return { spectrum: { wavenumber_cm1: res.x, y: res.y, y_unit: "Absorbance" }, k: f.proposed, name: row.name };
}

/** The recalled references as the shown spectrum sees them, computed once per spectrum, set, scale and mode. @param {import("./state.js").AppState} s @returns {RecallView} */
export function recallView(s) {
  const r = s.recall;
  const key = [activeFile(s)?.code, resultOf(s)?.sig, currentLang(), r.mode, r.scale, r.current, r.refs.map((x) => `${x.library}/${x.spectrumId}`).join(","), s.libraries.length].join("|");
  if (cached?.key !== key) cached = { key, value: compute(s) };
  return cached.value;
}

/** @param {Partial<import("./state.js").RecallState>} patch */
function setRecall(patch) {
  update({ recall: { ...getState().recall, ...patch } });
}

/** @param {import("./state.js").Recalled} ref @returns {boolean} whether it was added */
function add(ref) {
  const have = getState().recall.refs;
  if (have.some((x) => same(x, ref))) return false;
  if (have.length >= MAX_REFS) {
    say(t("recall.full", { max: String(MAX_REFS) }));
    return false;
  }
  setRecall({ refs: [...have, ref], current: have.length });
  say(t("recall.added", { name: recalledName(ref) }));
  return true;
}

/** @param {number} i */
function remove(i) {
  const r = getState().recall;
  const gone = r.refs[i];
  if (!gone) return;
  setRecall({ refs: r.refs.filter((_, j) => j !== i), current: Math.max(0, Math.min(r.current, r.refs.length - 2)) });
  say(t("recall.removed", { name: recalledName(gone) }));
}

/** Keep the difference shown as a residual under the spectrum it was made from. @returns {string | null} its code */
function keep() {
  const s = getState();
  const code = activeFile(s)?.code;
  const d = recallView(s).difference;
  if (!code || !d) return null;
  const row = s.recall.refs[Math.min(s.recall.current, s.recall.refs.length - 1)];
  const made = addResidual(code, d.spectrum, { name: d.name, library: row.library, k: Math.round(d.k * 100) / 100 });
  say(t("recall.kept", { code: made }));
  return made;
}

/** @param {(text: string) => void} announce */
export function recallActions(announce) {
  say = announce;
  return {
    recallAdd: add,
    recallRemove: remove,
    recallClear: () => setRecall({ refs: [], current: 0 }),
    setRecall,
    recallKeep: keep,
  };
}
