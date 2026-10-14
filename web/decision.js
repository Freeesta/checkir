// @ts-check
import { levelNumber, levelWord } from "./alerts.js";
import { preloadLang, t } from "./i18n.js";
import { mixtureCandidates, mixtureKeys } from "./mixture.js";
import { LISTED } from "./results.js";
import { candidateKey, getState, resultOf, update } from "./state.js";

/**
 * The chemist's choice. The program only proposes; the chemist decides. The level and the chosen candidates start as the
 * proposal and the chemist changes them at will. Everything lives in memory (`state.choice`); nothing is stored.
 * @typedef {import("./state.js").Choice} Choice
 */

/** How many candidates a level takes: [min, max]. Levels 1 and 2 name one substance, 3 one or two, 4 two or more, 5 none. @type {Record<number, [number, number]>} */
export const TAKES = { 1: [1, 1], 2: [1, 1], 3: [1, 2], 4: [2, Infinity], 5: [0, 0] };

/** The candidates the page lists, in order, then the components of the mixture proposal that are not among them. @param {any} data @returns {any[]} */
export function listed(data) {
  const top = (data.candidates ?? []).slice(0, LISTED);
  const known = new Set(top.map(candidateKey));
  return [...top, ...mixtureCandidates(data).filter((c) => !known.has(candidateKey(c)))];
}

/** The proposal as a choice: the proposed level and the candidates it rests on (the first one, or the two of an ambiguity). @param {any} data @returns {Choice} */
export function proposedChoice(data) {
  const level = levelNumber(data);
  const keys = listed(data).map(candidateKey);
  const ambiguous = (data.alerts ?? []).some((/** @type {any} */ a) => a.id === "ambiguity" && a.data?.second);
  return { level, keys: level === 5 ? [] : keys.slice(0, level === 3 && ambiguous ? 2 : 1) };
}

/** The choice for the spectrum shown: the chemist's, else the proposal; it is what the sheet is built from. @param {import("./state.js").AppState} s @returns {Choice | null} */
export function choiceOf(s) {
  const r = resultOf(s);
  if (!r) return null;
  const mine = s.choice[r.code];
  return mine ? { level: mine.level, keys: mine.keys.filter((k) => listed(r.data).some((c) => candidateKey(c) === k)) } : proposedChoice(r.data);
}

/** Did the chemist change the proposal (level or candidates)? @param {import("./state.js").AppState} s @returns {boolean} */
export function isChanged(s) {
  const r = resultOf(s);
  const mine = r ? choiceOf(s) : null;
  if (!r || !mine) return false;
  const was = proposedChoice(r.data);
  return mine.level !== was.level || mine.keys.length !== was.keys.length || mine.keys.some((k) => !was.keys.includes(k));
}

/** The candidates of a choice, in the order of the list. @param {Choice} d @param {any} data @returns {any[]} */
export function chosenCandidates(d, data) {
  return listed(data).filter((c) => d.keys.includes(candidateKey(c)));
}

/** @param {Partial<Choice>} patch @param {(text: string) => void} announce */
function setChoice(patch, announce) {
  const s = getState();
  const code = resultOf(s)?.code;
  const now = choiceOf(s);
  if (!code || !now) return;
  const next = { ...now, ...patch };
  if (patch.level !== undefined && patch.level !== now.level && patch.keys === undefined) {
    const data = /** @type {any} */ (resultOf(s)).data;
    next.keys = patch.level === 5 ? [] : now.keys.length ? now.keys.slice(0, TAKES[patch.level][1]) : proposedChoice(data).keys;
  }
  update({ choice: { ...s.choice, [code]: next } });
  announce(t("status.choice_changed", { level: levelWord(next.level) }));
}

/** Actions of the choice and of the sheet that need the state; merged into the page context. @param {(text: string) => void} announce */
export function decisionActions(announce) {
  return {
    setChoice: (/** @type {Partial<Choice>} */ patch) => setChoice(patch, announce),
    // The mixture proposal taken as the choice: level 4 and its components.
    acceptMixture: () => {
      const r = resultOf(getState());
      if (r) setChoice({ level: 4, keys: mixtureKeys(r.data) }, announce);
    },
    setSheetLang: async (/** @type {string} */ lang) => {
      await preloadLang(lang);
      update({ sheetLang: lang });
    },
  };
}
