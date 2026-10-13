// Substance sheet e2e: the sheet opens from the candidate's detail, shows version and state per section, keeps health sections and
// placeholders out, says "unsigned draft", cites sources, makes no request to another origin, and works by keyboard at 320 px.
import { readFile } from "node:fs/promises";
import { parseParagraphs, sectionStatus } from "../web/schede.js";

const REASSURING = /sicur|\bpur[oai]\b|pulit|via libera|\bok\b|negativ|\bsafe\b|\bpure\b|\bclean\b|all clear/i;
const SPECTRUM = new URL("../data/substances/synthetic-a/spectra/synthetic-a-base.checkir.001.jdx", import.meta.url);

/** The rules of what may be shown, on hand-made sheets, no browser. */
export async function sheetsPureScenario(check) {
  const sheet = (state, reviewers, effects) => ({ id: "x", names: {}, version: 1, section_state: { effects: state, risks: state, molecule: "draft" }, reviewers, reviewed: "", review_by: "", ai_assisted: true, texts: { en: { effects, risks: "Some fact. [f:a]", molecule: "A molecule. [f:b]" } } });
  check("sheets: a placeholder is never content", sectionStatus(sheet("approved", [{}], "Not written yet. [f:checkir-section-pending]"), "effects", "en") === "preparing");
  check("sheets: a health section that is not approved is never content", sectionStatus(sheet("draft", [], "A fact. [f:a]"), "risks", "en") === "preparing");
  check("sheets: an approved health section with a reviewer is shown", sectionStatus(sheet("approved", [{}], "A fact. [f:a]"), "risks", "en") === "shown");
  check("sheets: approved without a reviewer is not enough", sectionStatus(sheet("approved", [], "A fact. [f:a]"), "risks", "en") === "preparing");
  check("sheets: a draft chemistry section is shown (with the draft banner)", sectionStatus(sheet("draft", [], ""), "molecule", "en") === "shown");
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
  check("sheets: unsigned draft banner at the top, no tick or green", (await page.locator("dialog .draft-banner").count()) === 1 && /Bozza non firmata/.test(text) && (await page.locator("dialog .substance-sheet svg use[href$='#check']").count()) === 0);
  check("sheets: the ten sections with a state each", (await page.locator("dialog .sheet-section").count()) === 10 && (await page.locator("dialog .sheet-section .state-tag").count()) === 10);
  check("sheets: version and signed sections are written", /Versione \d+ · sezioni firmate: 0 su 10/.test(text), text.slice(0, 200));
  check("sheets: health sections say 'in preparazione', never content", (await page.locator('dialog [data-section="doses"] [data-preparing]').count()) === 1 && (await page.locator('dialog [data-section="harm_reduction"] [data-preparing]').count()) === 1);
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
