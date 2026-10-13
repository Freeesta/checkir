// @ts-check
import { formatNumber, t } from "./i18n.js";
import { parseDocument } from "./spectrum.js";
import { getState, update } from "./state.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./state.js").FileEntry} FileEntry */

/** Memory budget handed to every `open_file` (the engine never exceeds it). Same numbers as `Budget::STANDARD`. */
export const BUDGET = { maxBytes: 32 * 1024 * 1024, maxPoints: 1 << 20 };

/** Spectrum data lives here, in memory only; the state holds just the entries that describe them. @type {Map<string, Spectrum>} */
const store = new Map();
let seq = 0;

/** @param {string} code @returns {Spectrum | undefined} */
export function spectrumOf(code) {
  return store.get(code);
}

/** Range of an entry, e.g. `4000–400 · 4 cm⁻¹` (the resolution only when the file states it). @param {FileEntry} f @returns {string} */
export function fileRange(f) {
  const range = `${formatNumber(f.fromCm1)}–${formatNumber(f.toCm1)}`;
  return f.resolutionCm1 === null ? `${range} ${t("unit.cm1")}` : `${range} · ${formatNumber(f.resolutionCm1)} ${t("unit.cm1")}`;
}

/** @param {number[]} xs @returns {{ fromCm1: number, toCm1: number }} */
function extent(xs) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return { fromCm1: hi, toCm1: lo };
}

/**
 * Add a spectrum to the analysis as the next local code (C1, C2…) and make it the active one.
 * @param {Spectrum} spectrum
 * @param {Partial<FileEntry>} fields
 * @returns {string} the code
 */
export function addSpectrum(spectrum, fields) {
  const code = `C${++seq}`;
  store.set(code, spectrum);
  const entry = { code, name: null, demo: false, points: spectrum.y.length, ...extent(spectrum.wavenumber_cm1), resolutionCm1: null, role: "sample", parent: null, note: null, warnings: [], ...fields };
  const s = getState();
  update({ files: [...s.files, /** @type {FileEntry} */ (entry)], active: code, fileError: null });
  return code;
}

/** @param {Spectrum} demo */
export function addDemo(demo) {
  return addSpectrum(demo, { demo: true });
}

/** Read one file with the engine; a failure is a translatable notice in the state, never a thrown error. @param {File} file @param {import("./engine.js").Engine} engine */
async function readOne(file, engine) {
  if (file.size > BUDGET.maxBytes) return update({ fileError: { key: "reader.limit_exceeded", params: { limit: "bytes", max: String(BUDGET.maxBytes) } } });
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return update({ fileError: { key: "err.file.unreadable", params: {} } });
  }
  const r = parseDocument(engine.open_file(file.name, bytes, BUDGET.maxBytes, BUDGET.maxPoints));
  if ("error" in r) return update({ fileError: r.error });
  const warnings = [...r.notices];
  if (r.more > 0) warnings.push({ key: "reader.more_spectra", params: { count: String(r.more) } });
  if (r.spectrum.y_unit !== "Absorbance") warnings.push({ key: "reader.y_unit_other", params: {} });
  addSpectrum(r.spectrum, { name: file.name, resolutionCm1: r.resolutionCm1, warnings });
}

/** Open the chosen files one after the other, so the codes follow the order of choice. @param {Iterable<File>} files @param {import("./engine.js").Engine | null} engine @returns {Promise<number>} how many were read */
export async function openFiles(files, engine) {
  if (!engine) {
    update({ fileError: { key: "engine.error", params: {} } });
    return 0;
  }
  const before = getState().files.length;
  for (const f of files) await readOne(f, engine);
  return getState().files.length - before;
}

/** Remove an entry, its derived spectra and their data. The original files on disk are never touched. @param {string} code */
export function closeFile(code) {
  const s = getState();
  const gone = new Set([code]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of s.files) if (f.parent && gone.has(f.parent) && !gone.has(f.code)) grew = Boolean(gone.add(f.code));
  }
  for (const c of gone) store.delete(c);
  const files = s.files.filter((f) => !gone.has(f.code));
  if (!files.length) seq = 0;
  const results = Object.fromEntries(Object.entries(s.results).filter(([c]) => !gone.has(c)));
  update({ files, results, active: gone.has(/** @type {string} */ (s.active)) ? (files[0]?.code ?? null) : s.active, fileError: null });
}

/** Forget everything loaded. */
export function closeAll() {
  store.clear();
  seq = 0;
  update({ files: [], active: null, fileError: null, results: {}, labels: {}, selected: null, overlay: false });
}

/**
 * Connect the file chooser and the drop of files on the page to `openFiles`.
 * @param {{ engine: import("./engine.js").Engine | null, announce: (text: string) => void }} deps
 * @returns {{ choose: () => void }}
 */
export function wireFileInput({ engine, announce }) {
  /** @param {Iterable<File>} files */
  const load = async (files) => {
    const opened = await openFiles(files, engine);
    const s = getState();
    announce(s.fileError ? `${t("status.file_failed")} ${t(s.fileError.key, s.fileError.params)}` : opened ? t("status.file_loaded", { code: s.active ?? "" }) : "");
  };
  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;
  picker.hidden = true;
  picker.addEventListener("change", () => {
    const chosen = [...(picker.files ?? [])];
    picker.value = "";
    if (chosen.length) load(chosen);
  });
  const drop = document.createElement("div");
  drop.className = "drop";
  drop.setAttribute("aria-hidden", "true");
  drop.hidden = true;
  document.body.append(picker, drop);
  const carriesFiles = (/** @type {DragEvent} */ e) => Boolean(e.dataTransfer?.types.includes("Files"));
  document.addEventListener("dragover", (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    drop.textContent = t("file.drop");
    drop.hidden = false;
  });
  document.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) drop.hidden = true;
  });
  document.addEventListener("drop", (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    drop.hidden = true;
    if (e.dataTransfer?.files.length) load([...e.dataTransfer.files]);
  });
  return { choose: () => picker.click() };
}
