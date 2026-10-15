// Choice and counselling sheet e2e: the proposal and the chemist's choice, the three blocks, the words that must not appear, the A5 print (one page),
// talk mode, the language of the sheet, and the comparison flow on a synthetic library.
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";
import { importAs } from "./importa_aiuto.mjs";

const BLOCKS = ["head", "found", "alerts"];
/** Fixed warning texts the owner removed (13/10/2026): none of them may come back on the sheet. */
const NO_FIXED_WARNINGS = /5 %|fentanil|nitazen|quantit|diagnos|emergenza|112|riduzione del danno|harm reduction|emergency|not a diagnosis|may be something else/i;
/** Words a result must never use to reassure (the tool tools/check_words.py checks the catalogs, this checks the screen). */
const REASSURING = /sicur|\bpur[oai]\b|pulit|via libera|\bok\b|negativ|\bsafe\b|\bpure\b|\bclean\b|all clear/i;

async function openSheet(page) {
  const section = page.locator('details[data-panel="sheet"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

async function sample(page, n) {
  await page.click(`[data-sample="${n}"]`);
  await page.waitForSelector(".sheet-preview .sheet .sheet-block", { state: "attached", timeout: 10000 });
  await openSheet(page);
}

/** The panel's sheet: the three blocks in order, no fixed warning text, no score, nothing that reassures, a name never without its level. */
async function blocksScenario(page, check, axe) {
  await sample(page, 1);
  const order = await page.$$eval(".sheet-preview .sheet [data-block]", (n) => n.map((x) => x.getAttribute("data-block")));
  check("sheet: three blocks in the fixed order", JSON.stringify(order) === JSON.stringify(BLOCKS), order.join(","));
  const text = (await page.textContent(".sheet-preview .sheet")) ?? "";
  const body = await page.$$eval(".sheet-preview .sheet-block", (n) => n.map((x) => x.textContent).join(" "));
  check("sheet: nothing that reassures and no score", !REASSURING.test(text) && !/\b[01][.,]\d+\b/.test(body), body);
  check("sheet: no fixed warning text (limits, harm reduction, emergency, not a diagnosis)", !NO_FIXED_WARNINGS.test(text) && (await page.locator(".sheet-preview .sheet details").count()) === 0, text);
  check("sheet: a name never stands without the level", await page.evaluate(() => [...document.querySelectorAll(".sheet-name")].every((n) => n.closest(".found")?.querySelector(".level"))));
  const violations = await axe(page);
  check("sheet: axe has no violations", violations.length === 0, violations.join(", "));
}

/** The proposal stands until the chemist changes it, with no banner, watermark, signature or sign button; level 5 names no substance. */
async function choiceScenario(page, check) {
  await sample(page, 6);
  check("sheet: the proposal is on the sheet, with no banner, watermark, signature line or sign button", /proposto dal programma/i.test((await page.textContent(".sheet-preview .sheet-who")) ?? "") && (await page.locator(".sheet-banner, .sign-line, .signature, [data-action^='decision.']").count()) === 0 && (await page.getAttribute(".sheet-preview .sheet", "data-watermark")) === null);
  await page.check('[data-fk="lvl-3"]');
  check("sheet: changing the level shows the pen and who decided at once", /deciso dal chimico/i.test((await page.textContent(".result .decided")) ?? "") && /deciso dal chimico/i.test((await page.textContent(".sheet-preview .sheet-who")) ?? ""));
  await sample(page, 4);
  const none = (await page.textContent(".sheet-preview .found")) ?? "";
  check("sheet: level 5 says only that nothing was identified", /Non identificato/.test(none) && !/sostanze attive/.test(none) && (await page.locator(".sheet-preview .sheet-name").count()) === 0, none);
  await sample(page, 5);
  const first = await page.getAttribute(".sheet-preview .sheet-alert", "data-sheet-alert");
  check("sheet: a flagged family comes first among the alerts", first === "family_flagged", String(first));
}

/** The sheet has its own language; the interface keeps its own. */
async function languageScenario(page, check) {
  await sample(page, 1);
  await page.click('[data-sheet-lang="en"]');
  await page.waitForFunction(() => document.querySelector(".sheet-preview .sheet")?.getAttribute("lang") === "en");
  const text = (await page.textContent(".sheet-preview .sheet")) ?? "";
  check("sheet: English sheet with the Italian interface", /What we found/.test(text) && (await page.evaluate(() => document.documentElement.lang)) === "it");
  check("sheet: the English sheet has no fixed warning and nothing that reassures", !NO_FIXED_WARNINGS.test(text) && !REASSURING.test(text), text);
  await page.click('[data-sheet-lang="it"]');
}

/** Talk mode: the sheet alone, big letters, no score or chart, Esc leaves it and gives the focus back. */
async function talkScenario(page, check, axe) {
  await sample(page, 2);
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.body.dataset.talk === "1");
  const size = await page.$eval(".sheet-host .sheet", (n) => parseFloat(getComputedStyle(n).fontSize));
  check("talk: letters of at least 20 px", size >= 20, String(size));
  check("talk: no chart, panel or score", !(await page.isVisible("#chart")) && !(await page.isVisible("#panel")) && (await page.locator(".sheet-host .level-bar, .sheet-host meter").count()) === 0);
  check("talk: the sheet is visible and has no fixed warning", (await page.isVisible(".sheet-host .sheet")) && !NO_FIXED_WARNINGS.test((await page.textContent(".sheet-host .sheet")) ?? "") && /Tra .+ e .+/.test((await page.textContent(".sheet-host .found")) ?? ""));
  const violations = await axe(page);
  check("talk: axe has no violations", violations.length === 0, violations.join(", "));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.body.dataset.talk);
  check("talk: Esc leaves it and the chart is back", await page.isVisible("#chart"));
}

/** A5 print: one page for each of the six synthetic sheets, with no fixed warning, and a text of at least 10 pt. */
async function printScenario(page, check) {
  for (let n = 1; n <= 6; n++) {
    await page.emulateMedia({ media: "screen" });
    await page.click(`[data-sample="${n}"]`);
    await page.waitForSelector(".sheet-host .sheet-block", { state: "attached" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A5", printBackground: false });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    check(`print: sheet ${n} is one A5 page`, pages === 1, `${pages} pages`);
    const info = await page.evaluate(() => ({ text: document.querySelector(".sheet-host .sheet")?.textContent ?? "", size: parseFloat(getComputedStyle(document.querySelector(".sheet-host .sheet")).fontSize), bar: document.querySelector(".dev-bar")?.checkVisibility() ?? false, named: [...document.querySelectorAll(".sheet-host .sheet-name")].every((n) => n.closest(".found")?.querySelector(".level")) }));
    check(`print: sheet ${n} has no fixed warning, 10 pt text and nothing else`, !NO_FIXED_WARNINGS.test(info.text) && info.size >= 13.3 && !info.bar && info.named, JSON.stringify(info));
    if (n === 5) check("print: sheet 5 carries the family alert with the class", /Benzodiazepine/.test(info.text), info.text);
  }
  await page.emulateMedia({ media: "screen" });
}

/** The comparison flow on a synthetic library: the proposal fills the form, the rules of each level, and nothing stored. */
async function flowScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await importAs(page, "Sintetica", [{ name: "alfa.jdx", buffer: jcamp("alfa", ALFA) }, { name: "beta.jdx", buffer: jcamp("beta", BETA) }, { name: "gamma.jdx", buffer: jcamp("gamma", GAMMA) }]);
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]", [{ name: "campione_beta.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("campione_beta", BETA) }]);
  await page.waitForSelector(".result[data-level]", { state: "attached", timeout: 20000 });
  await openSheet(page);
  check("flow: the proposal fills the form (level 2, first candidate)", (await page.isChecked('[data-fk="lvl-2"]')) && (await page.isChecked('[data-fk="pick-0"]')) && /proposto dal programma/i.test((await page.textContent(".sheet-preview .sheet-who")) ?? ""));
  await page.check('[data-fk="lvl-4"]');
  check("flow: level 4 with one component shows the hint for two or more", /almeno due|two or more/i.test((await page.textContent(".decision .hint")) ?? ""));
  await page.check('[data-fk="pick-1"]');
  await page.waitForFunction(() => document.querySelector(".result")?.getAttribute("data-level") === "4");
  check("flow: the result and the chip show level 4 decided", (await page.getAttribute(".result", "data-level")) === "4" && /Miscela/.test((await page.textContent('[data-chip="result"]')) ?? "") && /proposto: T2 · Probabile/.test((await page.textContent(".result .decided")) ?? ""));
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), idb: (await indexedDB.databases()).length }));
  check("flow: nothing of the choice or the sheet is stored", !/decision|choice|sheet|draft|Beta|beta/.test(stored.local + stored.session) && stored.idb <= 1, JSON.stringify(stored));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("flow: after a reload no sheet, no choice, no result", (await page.locator(".sheet-block").count()) === 0 && (await page.locator(".result").count()) === 0);
  await ctx.close();
}

/** Phone width: the sheet panel and talk mode do not scroll sideways. */
async function phoneScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.click('[data-sample="5"]');
  await page.click("#tabbar [data-goto='sheet']");
  check("sheet: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.body.dataset.talk === "1");
  check("talk: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await ctx.close();
}

/** @param {import("playwright").Browser} browser */
export async function sheetScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await blocksScenario(page, check, axe);
  await choiceScenario(page, check);
  await languageScenario(page, check);
  await talkScenario(page, check, axe);
  await printScenario(page, check);
  check("sheet: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await flowScenario(browser, base, check);
  await phoneScenario(browser, base, check);
}
