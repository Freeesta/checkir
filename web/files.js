// @ts-check
import { formatNumber, t } from "./i18n.js";
import { engineUnit, parseDocument } from "./spectrum.js";
import { getState, update } from "./state.js";
import { canOpenFile, closePatch, openFilePatch, pointsInMemory, SHEETS_MAX, TABS_MAX } from "./tabs.js";

/** @typedef {import("./spectrum.js").Spectrum} Spectrum */
/** @typedef {import("./state.js").FileEntry} FileEntry */

/** Memory budget handed to every `open_file` (the engine never exceeds it). Same numbers as `Budget::STANDARD`. */
export const BUDGET = { maxBytes: 32 * 1024 * 1024, maxPoints: 1 << 20 };

/**
 * What can be open at once: at most 20 file tabs, 20 substance tabs and 4 194 304 points in all (roots and residuals), i.e. 16 B per point → at most 64 MiB of spectra.
 * A contract, not a measurement: past a limit the new file is refused with a notice and nothing is closed by itself; the person decides what to close.
 */
export const OPEN_BUDGET = { tabs: TABS_MAX, sheets: SHEETS_MAX, points: 1 << 22 };

/** Why a new spectrum of `points` points does not fit, or null. @param {number} points @param {boolean} newTab @returns {import("./state.js").Notice | null} */
function refusal(points, newTab) {
  const s = getState();
  if (newTab && !canOpenFile(s)) return { key: "err.tabs.limit", params: { max: String(OPEN_BUDGET.tabs) } };
  if (pointsInMemory(s) + points > OPEN_BUDGET.points) return { key: "err.tabs.points", params: { max: formatNumber(OPEN_BUDGET.points) } };
  return null;
}

/** @param {import("./state.js").Notice} notice */
function refuse(notice) {
  update({ tabNotice: notice, fileError: notice });
}

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
 * @returns {string} the code, or "" when the open-files budget has no room for it (the notice is in the state)
 */
export function addSpectrum(spectrum, fields) {
  const no = refusal(spectrum.y.length, true);
  if (no) return refuse(no), "";
  const code = `C${++seq}`;
  store.set(code, spectrum);
  const entry = { code, name: null, demo: false, points: spectrum.y.length, ...extent(spectrum.wavenumber_cm1), resolutionCm1: null, scans: null, sampling: "unknown", role: "sample", parent: null, note: null, derived: null, warnings: [], ...fields };
  const s = getState();
  const next = { ...s, files: [...s.files, /** @type {FileEntry} */ (entry)] };
  update({ files: next.files, active: code, fileError: null, tabNotice: null, ...openFilePatch(next, code) });
  return code;
}

/** Say how a sample was measured (an id of `campionamento.js`); the comparison of that sample is run again with it. @param {string} code @param {string} sampling */
export function setSampling(code, sampling) {
  update({ files: getState().files.map((f) => (f.code === code ? { ...f, sampling } : f)) });
}

/** Next code of a residual: the root sample's code, `-r`, and the next number (C1 → C1-r1 → C1-r2…). @param {string} parent @returns {string} */
function residualCode(parent) {
  const root = parent.split("-r")[0];
  const used = getState().files.map((f) => (f.code.startsWith(`${root}-r`) ? Number(f.code.slice(root.length + 2)) : 0));
  return `${root}-r${Math.max(0, ...used) + 1}`;
}

/**
 * Add a residual as a new spectrum under the one it was made from; the shown spectrum does not change and the original is never touched.
 * @param {string} parent code of the spectrum the reference was subtracted from
 * @param {Spectrum} spectrum
 * @param {import("./state.js").Derived} derived
 * @returns {string} the code, or "" when the points budget has no room for it
 */
export function addResidual(parent, spectrum, derived) {
  const no = refusal(spectrum.y.length, false);
  if (no) return refuse(no), "";
  const code = residualCode(parent);
  store.set(code, spectrum);
  const entry = { code, name: null, demo: false, points: spectrum.y.length, ...extent(spectrum.wavenumber_cm1), resolutionCm1: null, scans: null, sampling: "unknown", role: "residual", parent, note: null, derived, warnings: [] };
  update({ files: [...getState().files, /** @type {FileEntry} */ (entry)] });
  return code;
}

/** The last residual made, if any (the one `history.undo` takes away). @param {import("./state.js").AppState} s @returns {FileEntry | undefined} */
export function lastResidual(s) {
  return [...s.files].reverse().find((f) => f.role === "residual");
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
  if (engineUnit(r.spectrum) === null) warnings.push({ key: "reader.y_unit_other", params: {} });
  addSpectrum(r.spectrum, { name: file.name, resolutionCm1: r.resolutionCm1, scans: r.scans, sampling: r.sampling, warnings });
}

/** Whether the engine reads the file now, without adding it to the analysis (a file too big is left to `openFiles`, which says so). @param {File} file @param {import("./engine.js").Engine | null} engine @returns {Promise<boolean>} */
export async function isReadable(file, engine) {
  if (!engine || file.size > BUDGET.maxBytes) return true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return !("error" in parseDocument(engine.open_file(file.name, bytes, BUDGET.maxBytes, BUDGET.maxPoints)));
  } catch {
    return false;
  }
}

let lastSkipped = 0;

/** How many files the last `openFiles` left unopened because the tabs were full. @returns {number} */
export function skippedCount() {
  return lastSkipped;
}

/** Open the chosen files one after the other, so the codes follow the order of choice. @param {Iterable<File>} files @param {import("./engine.js").Engine | null} engine @returns {Promise<number>} how many were read */
export async function openFiles(files, engine) {
  if (!engine) {
    update({ fileError: { key: "engine.error", params: {} } });
    return 0;
  }
  const before = getState().files.length;
  let skipped = 0;
  for (const f of files) {
    if (!canOpenFile(getState())) skipped++;
    else await readOne(f, engine);
  }
  lastSkipped = skipped;
  if (skipped) refuse({ key: "err.tabs.limit", params: { max: String(OPEN_BUDGET.tabs) } });
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
  const choice = Object.fromEntries(Object.entries(s.choice).filter(([c]) => !gone.has(c)));
  const open = s.subtraction && gone.has(s.subtraction.sample) ? null : s.subtraction;
  const tab = s.tabs.find((t) => t.kind === "file" && t.code === code);
  const active = gone.has(/** @type {string} */ (s.active)) ? (s.files.find((f) => f.code === code)?.parent ?? files[0]?.code ?? null) : s.active;
  update({ files, results, choice, subtraction: open, active, fileError: null, ...(tab ? { tabNotice: null, ...closePatch(s, tab.id) } : {}) });
}

/** Forget everything loaded. */
export function closeAll() {
  store.clear();
  seq = 0;
  update({ tabs: [], focusTab: null, split: { panes: [], orientation: "row", linked: true }, tabNotice: null, files: [], active: null, fileError: null, results: {}, labels: {}, selected: null, overlay: true, choice: {}, talk: false, subtraction: null });
}

/**
 * Connect the file chooser and the drop of files on the page to `openFiles`.
 * A Shimadzu library among the chosen or dropped files (`.L01`, with its `.nam` and `.IDX`) is not a sample: all the files go to `onLibrary`, which imports them as a private library.
 * @param {{ engine: import("./engine.js").Engine | null, announce: (text: string) => void, onLibrary: (files: File[]) => void }} deps
 * @returns {{ choose: () => void }}
 */
export function wireFileInput({ engine, announce, onLibrary }) {
  /** @param {Iterable<File>} files */
  const load = async (files) => {
    const all = [...files];
    if (all.some((f) => /\.l01$/i.test(f.name))) return onLibrary(all);
    const opened = await openFiles(all, engine);
    const s = getState();
    const skipped = skippedCount();
    if (skipped) return announce(t("status.tabs_skipped", { count: String(skipped) }));
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
