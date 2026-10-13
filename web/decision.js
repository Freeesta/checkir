// @ts-check
import { levelNumber, levelWord } from "./alerts.js";
import { preloadLang, t } from "./i18n.js";
import { mixtureCandidates, mixtureKeys } from "./mixture.js";
import { LISTED } from "./results.js";
import { candidateKey, decisionOf, getState, resultOf, update } from "./state.js";

/**
 * The chemist's decision. The program only proposes: until the chemist signs, the sheet is a draft. The level and the chosen
 * candidates start as the proposal. Everything lives in memory (`state.decisions`, `state.draft`); nothing is stored.
 * @typedef {import("./state.js").DecisionDraft} Draft
 */

/** How many candidates a level takes: [min, max]. Levels 1 and 2 name one substance, 3 one or two, 4 two or more, 5 none. @type {Record<number, [number, number]>} */
export const TAKES = { 1: [1, 1], 2: [1, 1], 3: [1, 2], 4: [2, Infinity], 5: [0, 0] };

/** The candidates the page lists, in order, then the components of the mixture proposal that are not among them. @param {any} data @returns {any[]} */
export function listed(data) {
  const top = (data.candidates ?? []).slice(0, LISTED);
  const known = new Set(top.map(candidateKey));
  return [...top, ...mixtureCandidates(data).filter((c) => !known.has(candidateKey(c)))];
}

/** The proposal as a draft: the proposed level and the candidates it rests on (the first one, or the two of an ambiguity). @param {any} data @returns {Draft} */
export function proposedDraft(data) {
  const level = levelNumber(data);
  const keys = listed(data).map(candidateKey);
  const ambiguous = (data.alerts ?? []).some((/** @type {any} */ a) => a.id === "ambiguity" && a.data?.second);
  return { level, keys: level === 5 ? [] : keys.slice(0, level === 3 && ambiguous ? 2 : 1) };
}

/** The draft of the spectrum shown: the chemist's edits, else the proposal. @param {import("./state.js").AppState} s @returns {Draft | null} */
export function draftOf(s) {
  const r = resultOf(s);
  if (!r) return null;
  const mine = s.draft[r.code];
  return mine ? { level: mine.level, keys: mine.keys.filter((k) => listed(r.data).some((c) => candidateKey(c) === k)) } : proposedDraft(r.data);
}

/** The decision or, before it, the draft: what the sheet is built from. @param {import("./state.js").AppState} s @returns {Draft | null} */
export function shownChoice(s) {
  return decisionOf(s) ?? draftOf(s);
}

/** Can this draft be signed? @param {Draft} d @returns {boolean} */
export function isSignable(d) {
  const [min, max] = TAKES[d.level] ?? [0, 0];
  return d.keys.length >= min && d.keys.length <= max;
}

/** The candidates of a choice, in the order of the list. @param {Draft} d @param {any} data @returns {any[]} */
export function chosenCandidates(d, data) {
  return listed(data).filter((c) => d.keys.includes(candidateKey(c)));
}

/** @param {Partial<Draft>} patch @param {(text: string) => void} announce */
function setDraft(patch, announce) {
  const s = getState();
  const code = resultOf(s)?.code;
  const now = draftOf(s);
  if (!code || !now || decisionOf(s)) return;
  const next = { ...now, ...patch };
  if (patch.level !== undefined && patch.level !== now.level && patch.keys === undefined) {
    const data = /** @type {any} */ (resultOf(s)).data;
    next.keys = patch.level === 5 ? [] : now.keys.length ? now.keys.slice(0, TAKES[patch.level][1]) : proposedDraft(data).keys;
  }
  update({ draft: { ...s.draft, [code]: next } });
  announce(t("status.draft_changed", { level: levelWord(next.level) }));
}

/** Actions of the decision and of the sheet that need the state; merged into the page context. @param {(text: string) => void} announce */
export function decisionActions(announce) {
  return {
    setDraft: (/** @type {Partial<Draft>} */ patch) => setDraft(patch, announce),
    signDecision: () => {
      const s = getState();
      const r = resultOf(s);
      const d = draftOf(s);
      if (!r || !d || !isSignable(d)) return;
      update({ decisions: { ...s.decisions, [r.code]: { ...d, sig: r.sig } } });
      announce(t("status.decided", { level: levelWord(d.level) }));
    },
    revokeDecision: () => {
      const s = getState();
      const code = resultOf(s)?.code;
      if (!code) return;
      const decisions = { ...s.decisions };
      const old = decisions[code];
      delete decisions[code];
      update({ decisions, draft: old ? { ...s.draft, [code]: { level: old.level, keys: old.keys } } : s.draft });
      announce(t("status.decision_revoked"));
    },
    // The mixture proposal taken as the decision: level 4 and its components. The chemist still signs.
    acceptMixture: () => {
      const r = resultOf(getState());
      if (r) setDraft({ level: 4, keys: mixtureKeys(r.data) }, announce);
    },
    setSheetLang: async (/** @type {string} */ lang) => {
      await preloadLang(lang);
      update({ sheetLang: lang });
    },
  };
}
