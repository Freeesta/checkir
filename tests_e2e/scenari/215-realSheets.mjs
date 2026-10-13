// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { readFile } from "node:fs/promises";
import { SECTIONS, sectionStatus } from "../../web/schede.js";
import { parseTexts } from "../../tools/genera_schede.mjs";
import { REASSURING } from "../schede.mjs";

const REAL_SHEETS = ["cocaine", "mdma", "ketamine", "amphetamine", "methamphetamine", "heroin", "3-mmc", "4-mmc", "2c-b", "methoxetamine"];

/** The sheets of the main substances, read from data/ as the build reads them: every drafted section shown, the rest a placeholder, every citation known. */
export default async ({ check }) => {
  const data = new URL("../../data/", import.meta.url);
  const known = new Set(JSON.parse(await readFile(new URL("sources.json", data), "utf8")).sources.map((s) => s.id));
  for (const id of REAL_SHEETS) {
    const dir = new URL(`substances/${id}/datasheet/`, data);
    const ds = JSON.parse(await readFile(new URL("datasheet.json", dir), "utf8"));
    const texts = { en: parseTexts(await readFile(new URL("texts.en.md", dir), "utf8")), it: parseTexts(await readFile(new URL("texts.it.md", dir), "utf8")) };
    const sheet = { id, names: {}, version: ds.version, section_state: ds.section_state, reviewers: ds.reviewers, reviewed: ds.reviewed, review_by: ds.review_by, ai_assisted: ds.ai_assisted, texts };
    for (const lang of ["it", "en"]) {
      const shown = SECTIONS.filter((k) => sectionStatus(sheet, k, lang) === "shown");
      const drafted = SECTIONS.filter((k) => texts[lang][k] && !texts[lang][k].includes("[f:checkir-section-pending]"));
      check(`sheets: ${id} (${lang}) shows the drafted sections and no placeholder`, shown.join() === drafted.join(), shown.join());
      const all = Object.values(texts[lang]).join("\n");
      const refs = [...all.matchAll(/\[f:([a-z0-9-]+)\]/g)].map((m) => m[1]);
      check(`sheets: ${id} (${lang}) cites only known sources`, refs.length > 0 && refs.every((r) => known.has(r)), refs.filter((r) => !known.has(r)).join());
      check(`sheets: ${id} (${lang}) says nothing that reassures`, !REASSURING.test(all));
    }
  }
};
