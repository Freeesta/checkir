// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { readFile } from "node:fs/promises";
import { SECTIONS, sectionStatus } from "../../web/schede.js";
import { parseTexts } from "../../tools/genera_schede.mjs";
import { loadSources } from "../../tools/unisci_dati.mjs";
import { REASSURING } from "../schede.mjs";

// Sheets written in full (13 sections): every section that has text is shown, a placeholder stays empty.
const PILOT_SHEETS = ["cocaine", "mdma", "ketamine", "amphetamine", "heroin", "methamphetamine", "3-mmc", "4-mmc", "2c-b", "methoxetamine", "lsd", "psilocybin", "dmt", "5-meo-dmt", "mescaline"];
const REAL_SHEETS = ["cocaine", "mdma", "ketamine", "amphetamine", "methamphetamine", "heroin", "3-mmc", "4-mmc", "2c-b", "methoxetamine", "lsd", "psilocybin", "dmt", "5-meo-dmt", "mescaline"];

/** The sheets of the main substances, read from data/ as the build reads them: identity and IR text shown, the rest a placeholder except in the pilot sheets, every citation known. */
export default async ({ check }) => {
  const data = new URL("../../data/", import.meta.url);
  const known = new Set((await loadSources(data)).map((s) => s.id));
  for (const id of REAL_SHEETS) {
    const dir = new URL(`substances/${id}/datasheet/`, data);
    const ds = JSON.parse(await readFile(new URL("datasheet.json", dir), "utf8"));
    const texts = { en: parseTexts(await readFile(new URL("texts.en.md", dir), "utf8")), it: parseTexts(await readFile(new URL("texts.it.md", dir), "utf8")) };
    const sheet = { id, names: {}, version: ds.version, ai_assisted: ds.ai_assisted, texts };
    for (const lang of ["it", "en"]) {
      const shown = SECTIONS.filter((k) => sectionStatus(sheet, k, lang) === "shown");
      if (PILOT_SHEETS.includes(id)) {
        const drafted = SECTIONS.filter((k) => texts[lang][k] && !/checkir-section-pending/.test(texts[lang][k]));
        check(`sheets: ${id} (${lang}) shows every drafted section and no placeholder`, shown.join() === drafted.join() && ["molecule", "category", "sources", "license"].every((k) => shown.includes(k)), shown.join());
      } else check(`sheets: ${id} (${lang}) shows molecule, category, sources and license only`, shown.join() === "molecule,category,sources,license", shown.join());
      const all = Object.values(texts[lang]).join("\n");
      const refs = [...all.matchAll(/\[f:([a-z0-9-]+)\]/g)].map((m) => m[1]);
      check(`sheets: ${id} (${lang}) cites only known sources`, refs.length > 0 && refs.every((r) => known.has(r)), refs.filter((r) => !known.has(r)).join());
      check(`sheets: ${id} (${lang}) says nothing that reassures`, !REASSURING.test(Object.values(texts[lang]).join("\n")));
    }
  }
};
