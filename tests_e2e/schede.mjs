// Substance sheet e2e: the sheet opens from the candidate's detail, shows version and state per section, shows what exists
// with no banner and nothing hidden for caution (the state is plain data), cites sources, makes no request to another origin, and works by keyboard at 320 px.
import { readFile } from "node:fs/promises";
import { parseParagraphs, SECTIONS, sectionStatus } from "../web/schede.js";
import { parseTexts } from "../tools/genera_schede.mjs";

const REASSURING = /sicur|\bpur[oai]\b|pulit|via libera|\bok\b|negativ|\bsafe\b|\bpure\b|\bclean\b|all clear/i;
const REAL_SHEETS = ["cocaine", "mdma", "ketamine", "amphetamine", "methamphetamine", "heroin", "3-mmc", "4-mmc", "2c-b"];
const SPECTRUM = new URL("../data/substances/synthetic-a/spectra/synthetic-a-base.checkir.001.jdx", import.meta.url);

/** The rules of what may be shown, on hand-made sheets, no browser. */
export async function sheetsPureScenario(check) {
  const sheet = (text) => ({ id: "x", names: {}, version: 1, section_state: { effects: "draft" }, reviewers: [], reviewed: "", review_by: "", ai_assisted: true, texts: { en: { effects: text } } });
  check("sheets: a placeholder is an empty section", sectionStatus(sheet("Not written yet. [f:abc-section-pending]"), "effects", "en") === "empty");
  check("sheets: a missing section is empty", sectionStatus(sheet(""), "doses", "en") === "empty");
  check("sheets: a draft section with text is shown as it is", sectionStatus(sheet("A fact. [f:a]"), "effects", "en") === "shown");
  const order = [];
  const p = parseParagraphs("One. [f:a] Two. [f:b] [f:a]\n\nThree.", order);
  check("sheets: citations are numbered in order of first appearance", order.join() === "a,b" && p.length === 2 && p[0].filter((x) => x.ref).map((x) => x.n).join() === "1,2,1");
  await realSheetsScenario(check);
}

/** The sheets of the main substances, read from data/ as the build reads them: identity and IR text shown, the rest a placeholder, every citation known. */
async function realSheetsScenario(check) {
  const data = new URL("../data/", import.meta.url);
  const known = new Set(JSON.parse(await readFile(new URL("sources.json", data), "utf8")).sources.map((s) => s.id));
  for (const id of REAL_SHEETS) {
    const dir = new URL(`substances/${id}/datasheet/`, data);
    const ds = JSON.parse(await readFile(new URL("datasheet.json", dir), "utf8"));
    const texts = { en: parseTexts(await readFile(new URL("texts.en.md", dir), "utf8")), it: parseTexts(await readFile(new URL("texts.it.md", dir), "utf8")) };
    const sheet = { id, names: {}, version: ds.version, section_state: ds.section_state, reviewers: ds.reviewers, reviewed: ds.reviewed, review_by: ds.review_by, ai_assisted: ds.ai_assisted, texts };
    for (const lang of ["it", "en"]) {
      const shown = SECTIONS.filter((k) => sectionStatus(sheet, k, lang) === "shown");
      check(`sheets: ${id} (${lang}) shows molecule, category, sources and license only`, shown.join() === "molecule,category,sources,license", shown.join());
      const all = Object.values(texts[lang]).join("\n");
      const refs = [...all.matchAll(/\[f:([a-z0-9-]+)\]/g)].map((m) => m[1]);
      check(`sheets: ${id} (${lang}) cites only known sources`, refs.length > 0 && refs.every((r) => known.has(r)), refs.filter((r) => !known.has(r)).join());
      check(`sheets: ${id} (${lang}) says nothing that reassures`, !REASSURING.test(texts[lang].molecule + texts[lang].category));
    }
  }
}

/** The sheet in the page: open, read, close. */
export async function sheetsScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const foreign = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  page.on("request", (r) => { if (!r.url().startsWith(new URL(base).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) foreign.push(r.url()); });
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.waitForFunction(() => /1/.test(document.querySelector('[data-library="checkir-community"]')?.textContent ?? ""), null, { timeout: 20000 });
  await page.setInputFiles("input[type=file]", [{ name: "campione.jdx", mimeType: "chemical/x-jcamp-dx", buffer: await readFile(SPECTRUM) }]);
  const section = page.locator('details[data-panel="results"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const level = Number(await page.getAttribute(".result[data-level]", "data-level"));
  check("sheets: the synthetic sample gets a level 1-4 (the sheet button needs a name)", level >= 1 && level <= 4, String(level));
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("dialog .substance-sheet");
  const text = (await page.textContent("dialog .substance-sheet")) ?? "";
  check("sheets: the sheet is the one of the candidate", /^synthetic-/.test((await page.getAttribute("dialog .substance-sheet", "data-substance")) ?? ""));
  check("sheets: no banner, no note and no tick", (await page.locator("dialog [role=note]").count()) === 0 && !/Bozza non firmata/.test(text) && (await page.locator("dialog .substance-sheet svg use[href$='#check']").count()) === 0);
  check("sheets: the ten sections with a state each", (await page.locator("dialog .sheet-section").count()) === 10 && (await page.locator("dialog .sheet-section .state-tag").count()) === 10);
  check("sheets: version and signed sections are written", /Versione \d+ · sezioni firmate: 0 su 10/.test(text), text.slice(0, 200));
  check("sheets: every section that has text shows it, nothing is held back", (await page.locator('dialog [data-section="doses"] p:not([data-empty])').count()) >= 1 && (await page.locator("dialog [data-empty]").count()) === 0 && !/preparazione/.test(text));
  check("sheets: no raw [f:...] marker and nothing that reassures", !/\[f:/.test(text) && !REASSURING.test(text), text.slice(0, 200));
  const v = await axe(page);
  check("sheets: axe has no violations with the sheet open", v.length === 0, v.join(", "));
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog", { state: "detached" });
  check("sheets: Esc closes and the focus returns to the button", await page.evaluate(() => document.activeElement?.getAttribute("data-fk") === "open-sheet"));
  check("sheets: no request to another origin", foreign.length === 0, foreign.join(" "));
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("dialog .substance-sheet");
  await page.setViewportSize({ width: 320, height: 700 });
  check("sheets: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && (document.querySelector("dialog")?.scrollWidth ?? 0) <= (document.querySelector("dialog")?.clientWidth ?? 0) + 1));
  check("sheets: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
