// Conformance of the ACTIONS and PANELS registries (no browser needed): ids unique, catalog keys in every language,
// icons in the sprite, keys and steps not duplicated. Called by fumo.mjs; a registry entry without an Italian key fails it.
import { readFile, readdir } from "node:fs/promises";

const WEB = new URL("../web/", import.meta.url);
const RESERVED_KEYS = ["Tab", "Enter", " ", "Escape"];

/**
 * @param {Array<Record<string, any>>} actions
 * @param {Array<Record<string, any>>} panels
 * @param {Record<string, Record<string, string>>} catalogs language -> flat catalog
 * @param {Set<string>} icons ids found in icons.svg
 * @returns {string[]} problems (empty when the registries conform)
 */
export function registryProblems(actions, panels, catalogs, icons) {
  const bad = [];
  const dup = (what, values) => {
    const seen = new Set();
    for (const v of values) {
      if (seen.has(v)) bad.push(`duplicate ${what}: ${v}`);
      seen.add(v);
    }
  };
  dup("action id", actions.map((a) => a.id));
  dup("panel id", panels.map((p) => p.id));
  dup("panel number", panels.map((p) => p.n));
  dup("shortcut key", actions.filter((a) => a.key).map((a) => a.key));
  dup("step", actions.filter((a) => a.step !== undefined).map((a) => a.step));
  for (const a of actions) {
    for (const k of [a.labelKey, a.tipKey]) for (const [lang, cat] of Object.entries(catalogs)) if (!(k in cat)) bad.push(`action ${a.id}: key ${k} missing in ${lang}`);
    if (!icons.has(a.icon)) bad.push(`action ${a.id}: icon ${a.icon} not in the sprite`);
    if (a.key && (RESERVED_KEYS.includes(a.key) || /^(Ctrl|Alt|Meta)/.test(a.key))) bad.push(`action ${a.id}: reserved key ${a.key}`);
    if (typeof a.run !== "function" || typeof a.enabled !== "function") bad.push(`action ${a.id}: run/enabled missing`);
  }
  for (const p of panels) {
    for (const k of [p.titleKey, p.tipKey]) for (const [lang, cat] of Object.entries(catalogs)) if (!(k in cat)) bad.push(`panel ${p.id}: key ${k} missing in ${lang}`);
    if (!icons.has(p.icon)) bad.push(`panel ${p.id}: icon ${p.icon} not in the sprite`);
    if (!actions.some((a) => a.id === `panel.goto.${p.n}` && a.section === p.id)) bad.push(`panel ${p.id}: no action panel.goto.${p.n}`);
  }
  return bad;
}

/** Load the real registries and catalogs, run the checks, and prove that a broken entry is caught. */
export async function registryScenario(check) {
  const { ACTIONS } = await import(new URL("actions.js", WEB));
  const { PANELS } = await import(new URL("panels.js", WEB));
  const catalogs = {};
  for (const f of await readdir(new URL("lang/", WEB))) catalogs[f.replace(/\.json$/, "")] = JSON.parse(await readFile(new URL(`lang/${f}`, WEB), "utf8"));
  const sprite = await readFile(new URL("icons.svg", WEB), "utf8");
  const icons = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const problems = registryProblems(ACTIONS, PANELS, catalogs, icons);
  check("registries: actions and panels conform", problems.length === 0, problems.join("; "));
  const probe = { id: "probe.test", labelKey: "probe.missing.label", tipKey: "action.file_open.tip", icon: "file", run() {}, enabled: () => true };
  check("registries: a probe action without an Italian key fails", registryProblems([...ACTIONS, probe], PANELS, catalogs, icons).some((p) => p.includes("probe.missing.label missing in it")));
  check("registries: duplicate keys and steps are caught", registryProblems([{ ...probe, labelKey: "action.file_open.label", key: "o", step: 1 }, { ...probe, id: "probe.two", labelKey: "action.file_open.label", key: "o", step: 1 }], [], catalogs, icons).length >= 2);
}
