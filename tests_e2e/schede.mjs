// Substance sheet e2e: the sheet opens from the candidate's detail, shows version and state per section, shows what exists
// with no banner and nothing hidden for caution (the state is plain data), cites sources, makes no request to another origin, and works by keyboard at 320 px.
import { readFile } from "node:fs/promises";
import { chipCount } from "./conteggio.mjs";
import { parseParagraphs, sectionStatus } from "../web/schede.js";
import { CANARIES } from "./canarino.mjs";

export const REASSURING = /sicur|\bpur[oai]\b|pulit|via libera|\bok\b|negativ|\bsafe\b|\bpure\b|\bclean\b|all clear/i;
const SPECTRUM = new URL("../data/substances/synthetic-a/spectra/synthetic-a-base.checkir.001.jdx", import.meta.url);

/** The synthetic spectrum with the canary metadata of PRIVACY T2 added to its header. @param {string} jdx @returns {string} */
function canarySpectrum(jdx) {
  const [, ...rest] = jdx.split("\n");
  return [`##TITLE=${CANARIES.sample}`, `##ORIGIN=${CANARIES.operator}`, `##LONG DATE=${CANARIES.date} ${CANARIES.time}`, `##SOURCE REFERENCE=${CANARIES.path}\\${CANARIES.fileName}`, `##SPECTROMETER/DATA SYSTEM=SNO: ${CANARIES.serial}`, ...rest].join("\n");
}

/** The rules of what may be shown, on hand-made sheets, no browser. */
export async function sheetsPureScenario(check) {
  const sheet = (text) => ({ id: "x", names: {}, version: 1, ai_assisted: true, texts: { en: { effects: text } } });
  check("sheets: a placeholder is an empty section", sectionStatus(sheet("Not written yet. [f:abc-section-pending]"), "effects", "en") === "empty");
  check("sheets: a missing section is empty", sectionStatus(sheet(""), "doses", "en") === "empty");
  check("sheets: a section with text is shown as it is", sectionStatus(sheet("A fact. [f:a]"), "effects", "en") === "shown");
  const order = [];
  const p = parseParagraphs("One. [f:a] Two. [f:b] [f:a]\n\nThree.", order);
  check("sheets: citations are numbered in order of first appearance", order.join() === "a,b" && p.length === 2 && p[0].filter((x) => x.ref).map((x) => x.n).join() === "1,2,1");
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
  await page.waitForFunction(() => /1/.test(document.querySelector('[data-library="checkir-demo"]')?.textContent ?? ""), null, { timeout: 20000 });
  await page.getByRole("checkbox", { name: /checkir-demo/ }).check();
  await page.waitForFunction((x) => document.querySelector('[data-chip="library"]')?.textContent?.includes(x), await chipCount(base, { withDemo: true }), { timeout: 20000 });
  await page.setInputFiles("input[type=file]", [{ name: CANARIES.fileName, mimeType: "chemical/x-jcamp-dx", buffer: Buffer.from(canarySpectrum(await readFile(SPECTRUM, "utf8"))) }]);
  const section = page.locator('details[data-panel="results"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const level = Number(await page.getAttribute(".result[data-level]", "data-level"));
  check("sheets: the synthetic sample gets a level 1-4 (the sheet button needs a name)", level >= 1 && level <= 4, String(level));
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("#sheet-pane .substance-sheet");
  const text = (await page.textContent("#sheet-pane .substance-sheet")) ?? "";
  check("sheets: the sheet is the one of the candidate", /^synthetic-/.test((await page.getAttribute("#sheet-pane .substance-sheet", "data-substance")) ?? ""));
  check("sheets: no banner, no note and no tick", (await page.locator("#sheet-pane [role=note]").count()) === 0 && !/firmat|bozza|revision/i.test(text) && (await page.locator("#sheet-pane .substance-sheet svg use[href$='#check']").count()) === 0);
  check("sheets: the thirteen sections, with no state tag", (await page.locator("#sheet-pane .sheet-section").count()) === 13 && (await page.locator("#sheet-pane .sheet-section .state-tag").count()) === 0);
  check("sheets: version and written sections are stated", /Versione \d+ · sezioni scritte: \d+ su 13/.test(text), text.slice(0, 200));
  check("sheets: every section that has text shows it, the five new ones say they are not written yet", (await page.locator('#sheet-pane [data-section="doses"] p:not([data-empty])').count()) >= 1 && (await page.locator("#sheet-pane [data-empty]").count()) === 5 && !/preparazione/.test(text));
  check("sheets: no raw [f:...] marker and nothing that reassures", !/\[f:/.test(text) && !REASSURING.test(text), text.slice(0, 200));
  const v = await axe(page);
  check("sheets: axe has no violations with the sheet open", v.length === 0, v.join(", "));
  check("sheets: the title of the sheet has the focus and the sheet is in a tab panel named by its tab", await page.evaluate(() => document.activeElement?.id === "sheet-title" && document.getElementById("sheet-pane")?.getAttribute("aria-labelledby") === document.querySelector('#doc-tabs [data-kind="sheet"]')?.id));
  await page.focus('#doc-tabs [data-kind="sheet"]');
  await page.keyboard.press("Delete");
  await page.waitForSelector("#sheet-pane", { state: "hidden" });
  check("sheets: Delete on the tab closes the sheet and the focus goes to the neighbour tab", await page.evaluate(() => document.activeElement?.getAttribute("role") === "tab" && document.activeElement?.getAttribute("data-kind") === "file"));
  check("sheets: no request to another origin", foreign.length === 0, foreign.join(" "));
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("#sheet-pane .substance-sheet");
  await page.setViewportSize({ width: 320, height: 700 });
  check("sheets: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && (document.getElementById("sheet-pane")?.scrollWidth ?? 0) <= (document.getElementById("sheet-pane")?.clientWidth ?? 0) + 1));
  check("sheets: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
