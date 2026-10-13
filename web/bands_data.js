// @ts-check

/**
 * The IR band data the peak card explains with: group rules (`bands/1`), groups, vibration modes (`modes/1`), the sources of the numbers and the texts
 * (`band-texts/1`, one language at a time). The site build copies them to `bands/`; if one is missing the card just says less, never something else.
 * @typedef {{ id: string, group: string, mode: string, bond?: string, range_cm1: { min: number, max: number }, intensity?: string, shape?: string, sources: string[], status: string, false_friends?: string[] }} Rule
 * @typedef {{ atoms: Array<{ el: string, xyz: number[] }>, bonds: number[][], period_s: number, displacements: number[][] } } Animation
 * @typedef {{ id: string, names: { it: string, en: string }, kind: string, symmetry: string | null, in_plane: boolean | null, animation: Animation | null }} Mode
 */

/** @type {{ rules: Map<string, Rule>, groups: Map<string, { names: { it: string, en: string }, formula_hint?: string }>, modes: Map<string, Mode>, sources: Map<string, { title: string, url?: string }>, texts: Record<string, string>, lang: string }} */
const data = { rules: new Map(), groups: new Map(), modes: new Map(), sources: new Map(), texts: {}, lang: "" };
let staticLoaded = false;

/** @param {string} name @returns {Promise<any | null>} */
async function getJson(name) {
  try {
    const res = await fetch(new URL(`bands/${name}`, import.meta.url));
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Load the data (once) and the texts of a language (again when it changes). Never throws. @param {string} lang @returns {Promise<void>} */
export async function loadBandData(lang) {
  if (!staticLoaded) {
    const [rules, groups, modes, sources] = await Promise.all([getJson("rules.json"), getJson("groups.json"), getJson("modes.json"), getJson("sources.json")]);
    for (const r of rules?.rules ?? []) data.rules.set(r.id, r);
    for (const g of groups?.groups ?? []) data.groups.set(g.id, g);
    for (const m of modes?.modes ?? []) data.modes.set(m.id, m);
    for (const s of sources?.sources ?? []) data.sources.set(s.id, s);
    staticLoaded = true;
  }
  if (data.lang !== lang) {
    const texts = await getJson(`texts.${lang}.json`);
    data.texts = texts?.texts ?? {};
    data.lang = lang;
  }
}

/** @param {string} id @returns {Rule | undefined} */
export function ruleOf(id) {
  return data.rules.get(id);
}

/** @param {string} group @returns {Rule[]} every rule of a group, widest wavenumber first */
export function rulesOfGroup(group) {
  return [...data.rules.values()].filter((r) => r.group === group).sort((a, b) => b.range_cm1.max - a.range_cm1.max);
}

/** @param {string} id @returns {string} the group's name in the active language, its id when unknown */
export function groupName(id) {
  const g = data.groups.get(id);
  return g ? (g.names[/** @type {"it" | "en"} */ (data.lang === "it" ? "it" : "en")] ?? g.names.en) : id;
}

/** @param {string} id @returns {Mode | undefined} */
export function modeOf(id) {
  return data.modes.get(id);
}

/** @param {string} id @returns {string} */
export function modeName(id) {
  const m = data.modes.get(id);
  return m ? (m.names[/** @type {"it" | "en"} */ (data.lang === "it" ? "it" : "en")] ?? m.names.en) : id;
}

/** @param {string} id @returns {string | null} the mode's one-sentence definition */
export function modeDefinition(id) {
  return data.texts[`modes.${id}.definition`] ?? null;
}

/** The text of a rule at a level; a missing level falls back to the next simpler one (teaching → chemist → counsellor) and says which it used. @param {string} ruleId @param {"counsellor" | "chemist" | "teaching"} level @returns {{ text: string, level: string } | null} */
export function ruleText(ruleId, level) {
  const order = level === "teaching" ? ["teaching", "chemist", "counsellor"] : level === "chemist" ? ["chemist", "counsellor"] : ["counsellor"];
  for (const l of order) {
    const text = data.texts[`bands.${ruleId}.${l}`];
    if (text) return { text, level: l };
  }
  return null;
}

/** @param {string[]} ids @returns {string[]} titles of the sources (the id when unknown) */
export function sourceTitles(ids) {
  return ids.map((id) => data.sources.get(id)?.title ?? id);
}
