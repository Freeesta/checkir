// @ts-check
import { getState, update } from "./state.js";
import { t } from "./i18n.js";

/**
 * Which part of the spectrum the comparison uses: a preset of the thresholds (`range_presets` in `soglie_confronto`) or ranges
 * chosen by hand. Pure helpers plus the actions that change the choice; the choice lives in memory only, never stored.
 * @typedef {[number, number]} Range
 * @typedef {import("./state.js").RangeChoice} RangeChoice
 */

/** The grid of the library packages and the zone always left out (diamond), cm⁻¹. */
export const GRID = { from: 650, to: 3800, step: 2 };
export const MASK_CM1 = /** @type {Range} */ ([1900, 2400]);
/** Smallest region the engine accepts (`range_limits` in the thresholds). */
export const LIMITS = { minCm1: 400, minPoints: 150 };

/**
 * The presets the page offers, mirrored from `range_presets` of `data/soglie_confronto.json` (`fumo.mjs` checks both lists are equal).
 * `labelKey` is literal so the language check sees it.
 * @type {Array<{ id: string, ranges: Range[], labelKey: string, tipKey: string }>}
 */
export const PRESETS = [{ id: "full", ranges: [[650, 3800]], labelKey: "ranges.preset.full", tipKey: "ranges.preset.full_tip" }];

/** @returns {RangeChoice} the whole range */
export function fullChoice() {
  return { preset: "full", ranges: [] };
}

/** @param {RangeChoice} c @returns {boolean} the comparison uses the whole range */
export function isFull(c) {
  return c.preset === "full";
}

/** Clip to the grid, drop empty ranges, sort and merge those that touch. @param {Range[]} list @returns {Range[]} */
export function normalizeRanges(list) {
  const clipped = list
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    .map(([a, b]) => /** @type {Range} */ ([Math.max(GRID.from, Math.min(a, b)), Math.min(GRID.to, Math.max(a, b))]))
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  /** @type {Range[]} */
  const out = [];
  for (const r of clipped) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** Grid points of the ranges, the mask left out. @param {Range[]} ranges @returns {number} */
export function pointsIn(ranges) {
  let n = 0;
  for (let x = GRID.from; x <= GRID.to; x += GRID.step) {
    if (x >= MASK_CM1[0] && x <= MASK_CM1[1]) continue;
    if (ranges.some(([a, b]) => x >= a && x <= b)) n++;
  }
  return n;
}

/** Error of a region that is too narrow, in the shape the engine uses (the page translates `confronti.*`), or null. @param {Range[]} ranges @returns {{ key: string, params: Record<string, string> } | null} */
export function narrowError(ranges) {
  const count = pointsIn(ranges);
  const cm1 = count * GRID.step;
  if (cm1 >= LIMITS.minCm1 && count >= LIMITS.minPoints) return null;
  return { key: "confronti.regione_troppo_stretta", params: { cm1: String(cm1), punti: String(count), minimo_cm1: String(LIMITS.minCm1), minimo_punti: String(LIMITS.minPoints) } };
}

/** The ranges a choice stands for. @param {RangeChoice} c @returns {Range[]} */
export function rangesOf(c) {
  return c.preset ? (PRESETS.find((p) => p.id === c.preset)?.ranges ?? []) : c.ranges;
}

/** Engine options of a choice: a preset id, or the list of ranges. @param {RangeChoice} c @returns {{ range_preset: string } | { ranges: Range[] }} */
export function optionsOf(c) {
  return c.preset ? { range_preset: c.preset } : { ranges: c.ranges };
}

/** Key that changes whenever the choice changes (part of the signature of a result). @param {RangeChoice} c @returns {string} */
export function choiceKey(c) {
  return c.preset ? `p:${c.preset}` : `r:${c.ranges.map((r) => r.join("-")).join(",")}`;
}

/** @param {import("./state.js").AppState} s @returns {RangeChoice} */
export function choiceOf(s) {
  return s.rangeChoice;
}

/**
 * Change the choice and tell it. A hand-made list that is empty goes back to the whole range; one that is too narrow is kept (the
 * person is still typing) and the comparison is not asked until it is wide enough: the error stays visible next to the fields.
 * @param {RangeChoice} next @param {(text: string) => void} announce
 */
function setChoice(next, announce) {
  update({ rangeChoice: next, rangeError: next.preset ? null : (narrowError(normalizeRanges(next.ranges)) ?? null) });
  announce(next.preset ? t("ranges.status.preset", { name: t(PRESETS.find((p) => p.id === next.preset)?.labelKey ?? "ranges.preset.full") }) : t("ranges.status.custom", { count: String(next.ranges.length) }));
}

/** @param {(text: string) => void} announce */
export function rangeActions(announce) {
  return {
    /** @param {string} id */
    setPreset: (id) => setChoice({ preset: id, ranges: [] }, announce),
    /** Replace the hand-made list (keeps the order the person typed; merges only when asked). @param {Range[]} ranges */
    setRanges: (ranges) => setChoice(ranges.length ? { preset: null, ranges } : fullChoice(), announce),
    /** Add one range to the hand-made list, starting from the preset's ranges when there is none yet. @param {Range} range */
    addRange: (range) => {
      const c = getState().rangeChoice;
      const base = c.preset ? [] : c.ranges;
      setChoice({ preset: null, ranges: normalizeRanges([...base, range]) }, announce);
    },
    removeRange: (/** @type {number} */ i) => {
      const c = getState().rangeChoice;
      setChoice(c.preset ? c : c.ranges.length > 1 ? { preset: null, ranges: c.ranges.filter((_, k) => k !== i) } : fullChoice(), announce);
    },
    clearRanges: () => setChoice(fullChoice(), announce),
    /** A field that does not hold a usable number. */
    rejectRange: () => update({ rangeError: { key: "err.range.invalid", params: {} } }),
  };
}

/**
 * The range actions of the page context, plus the two that need the chart and the panels.
 * @param {(text: string) => void} announce @param {{ cursorRange: () => [number, number] | null, openResults: () => void }} hooks
 */
export function rangeContext(announce, hooks) {
  const actions = rangeActions(announce);
  return {
    ...actions,
    rangeFromCursors: () => {
      const pair = hooks.cursorRange();
      if (pair) actions.addRange([Math.round(pair[0]), Math.round(pair[1])]);
      else announce(t("ranges.cursors_missing"));
    },
    // `g` shows the picker (and puts the focus in it) or hides it again.
    openRanges: () => {
      const open = !getState().rangesOpen;
      update({ rangesOpen: open });
      if (!open) return;
      hooks.openResults();
      /** @type {HTMLElement | null} */ (document.querySelector('[data-fk="range-preset-full"]'))?.focus();
    },
  };
}
