// @ts-check
import { el } from "./dom.js";
import { t } from "./i18n.js";
import { closeAll, addSpectrum } from "./files.js";
import { setAutoMatch } from "./match.js";
import { getState, subscribe, update } from "./state.js";

/**
 * Development only (main.js loads this module on localhost, never on the public site): six synthetic cases to print on A5 and show
 * to the counsellors. The names are invented, no real sample or substance is meant. Each case is a hand-made comparison result.
 */

/** @param {number} rank @param {string} name @param {string} form @returns {any} */
function cand(rank, name, form) {
  return { rank, library: "prova", spectrum_id: `s${rank}`, display_name: name, form, r_derivative: 0.97 - rank * 0.03, coverage: 0.95 };
}
const ALFA = cand(1, "Alfa-prova", "HCl");
const BETA = cand(2, "Beta-prova", "base");
const GAMMA = cand(3, "Gamma-prova", "");

/** @param {string} level @param {any[]} candidates @param {Array<{ id: string, data: any }>} [alerts] @returns {any} */
function result(level, candidates, alerts = []) {
  return { level_proposed: level, candidates, alerts: [...alerts], libraries: [{ id: "prova", version: "0", searched: true }], chain: { derivative: "confronto_v1" }, margin: 0.1, range_preset: "full", level_caps: [] };
}

/** The six cases: the comparison result, and the decision (null = still a draft). @type {Array<{ data: any, decision: null | { level: number, keys: string[] } }>} */
const CASES = [
  { data: result("probable", [ALFA, BETA, GAMMA]), decision: { level: 2, keys: ["prova/s1"] } },
  { data: result("to_check", [ALFA, BETA, GAMMA], [{ id: "ambiguity", data: { first: { display_name: "Alfa-prova", form: "HCl", r: 0.94 }, second: { display_name: "Beta-prova", form: "base", r: 0.91 } } }]), decision: { level: 3, keys: ["prova/s1", "prova/s2"] } },
  { data: result("to_check", [ALFA, BETA, GAMMA]), decision: { level: 4, keys: ["prova/s1", "prova/s3"] } },
  { data: result("not_identified", [ALFA, BETA, GAMMA]), decision: { level: 5, keys: [] } },
  { data: result("probable", [ALFA, BETA, GAMMA], [{ id: "flagged_family", data: { family: "Delta-prova" } }, { id: "quality_noise", data: { ratio: 12, limit: 20 } }]), decision: { level: 2, keys: ["prova/s1"] } },
  { data: result("probable", [ALFA, BETA, GAMMA]), decision: null },
];

/** Replace whatever is loaded with case `n` (1–6) as spectrum C1. The automatic comparison goes off, or it would replace the hand-made result. @param {number} n */
export function loadSample(n) {
  const c = CASES[n - 1];
  if (!c) return;
  setAutoMatch(false);
  closeAll();
  const wavenumber_cm1 = Array.from({ length: 200 }, (_, i) => 650 + i * 16);
  const code = addSpectrum({ wavenumber_cm1, y: wavenumber_cm1.map((x) => 0.1 + 0.5 / (1 + ((x - 1700) / 40) ** 2)) }, {});
  const sig = "prova";
  const s = getState();
  update({ results: { ...s.results, [code]: { code, data: c.data, sig } }, decisions: c.decision ? { [code]: { ...c.decision, sig } } : {} });
}

/** Add the bar with the six buttons at the foot of the page. */
export function mountSamples() {
  const bar = el("div", { class: "dev-bar", role: "group" });
  const buttons = [1, 2, 3, 4, 5, 6].map((n) => {
    const b = el("button", { type: "button", class: "btn", "data-sample": String(n) }, [String(n)]);
    b.addEventListener("click", () => loadSample(n));
    return b;
  });
  const names = [() => t("dev.sample.1"), () => t("dev.sample.2"), () => t("dev.sample.3"), () => t("dev.sample.4"), () => t("dev.sample.5"), () => t("dev.sample.6")];
  const label = () => {
    bar.setAttribute("aria-label", t("dev.samples"));
    buttons.forEach((b, i) => b.setAttribute("aria-label", names[i]()));
  };
  bar.append(...buttons);
  document.body.append(bar);
  label();
  subscribe(label);
}
