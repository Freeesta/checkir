// Decision and counselling sheet e2e: draft and signed sheet, the seven blocks, the words that must not appear, the A5 print (one page,
// the strip of limits), talk mode, the language of the sheet, and the comparison flow on a synthetic library.
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";

const BLOCKS = ["head", "found", "alerts", "limits", "harm", "emergency", "foot"];
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

/** The panel's sheet: the seven blocks in order, the limits always there, no score, nothing that reassures, a name never without its level. */
async function blocksScenario(page, check, axe) {
  await sample(page, 1);
  const order = await page.$$eval(".sheet-preview .sheet [data-block]", (n) => n.map((x) => x.getAttribute("data-block")));
  check("sheet: seven blocks in the fixed order", JSON.stringify(order) === JSON.stringify(BLOCKS), order.join(","));
  const text = (await page.textContent(".sheet-preview .sheet")) ?? "";
  const body = await page.$$eval(".sheet-preview .sheet-block", (n) => n.map((x) => x.textContent).join(" "));
  check("sheet: nothing that reassures and no score", !REASSURING.test(text) && !/\b[01][.,]\d+\b/.test(body), body);
  check("sheet: the four limits are there and cannot be folded", (await page.locator(".sheet-preview .sheet-limits li").count()) === 4 && (await page.locator(".sheet-preview .sheet details").count()) === 0);
  check("sheet: the fixed sentence about what else may be there", /Anche se corrisponde a quanto atteso, può esserci altro che lo strumento non vede/.test(text));
  check("sheet: harm reduction says the text is under review", /Testo in revisione: chiedere all'operatore/.test(text));
  check("sheet: a name never stands without the level", await page.evaluate(() => [...document.querySelectorAll(".sheet-name")].every((n) => n.closest(".found")?.querySelector(".level"))));
  check("sheet: signed, so no draft mark", (await page.getAttribute(".sheet-preview .sheet", "data-draft")) === "0" && (await page.locator(".sheet-banner").count()) === 0);
  const violations = await axe(page);
  check("sheet: axe has no violations", violations.length === 0, violations.join(", "));
}

/** Draft until the chemist signs; revoking goes back to the draft; level 5 never says "no active substances". */
async function draftScenario(page, check) {
  await sample(page, 6);
  check("sheet: undecided sheet is a draft with the watermark", (await page.getAttribute(".sheet-preview .sheet", "data-draft")) === "1" && /BOZZA, non consegnare/.test((await page.textContent(".sheet-banner")) ?? "") && /BOZZA/.test((await page.getAttribute(".sheet-preview .sheet", "data-watermark")) ?? ""));
  await page.click('.panel-body [data-action="decision.sign"]');
  check("sheet: signing removes the draft mark", (await page.getAttribute(".sheet-preview .sheet", "data-draft")) === "0");
  check("sheet: the result block shows the pen and who decided", /deciso dal chimico/.test((await page.textContent(".result .decided")) ?? ""));
  await page.click('.panel-body [data-action="decision.revoke"]');
  check("sheet: changing the decision goes back to the draft", (await page.getAttribute(".sheet-preview .sheet", "data-draft")) === "1");
  await sample(page, 4);
  const none = (await page.textContent(".sheet-preview .found")) ?? "";
  check("sheet: level 5 says it does not mean there are no active substances", /Non vuol dire che non ci siano sostanze attive/.test(none) && (await page.locator(".sheet-preview .sheet-name").count()) === 0, none);
  await sample(page, 5);
  const first = await page.getAttribute(".sheet-preview .sheet-alert", "data-sheet-alert");
  check("sheet: a flagged family comes first among the alerts", first === "flagged_family", String(first));
}

/** The sheet has its own language; the interface keeps its own. */
async function languageScenario(page, check) {
  await sample(page, 1);
  await page.click('[data-sheet-lang="en"]');
  await page.waitForFunction(() => document.querySelector(".sheet-preview .sheet")?.getAttribute("lang") === "en");
  const text = (await page.textContent(".sheet-preview .sheet")) ?? "";
  check("sheet: English sheet with the Italian interface", /What we found/.test(text) && /Even if it matches what was expected/.test(text) && (await page.evaluate(() => document.documentElement.lang)) === "it");
  check("sheet: the English sheet names the product only through the foot line", /Analysis assisted by .+ v\d/.test(text) && !REASSURING.test(text));
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
  check("talk: the sheet and the limits are visible", (await page.isVisible(".sheet-host .sheet-limits")) && /Tra .+ e .+/.test((await page.textContent(".sheet-host .found")) ?? ""));
  const violations = await axe(page);
  check("talk: axe has no violations", violations.length === 0, violations.join(", "));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.body.dataset.talk);
  check("talk: Esc leaves it and the chart is back", await page.isVisible("#chart"));
}

/** A5 print: one page for each of the six synthetic sheets, with the strip of limits and a text of at least 10 pt. */
async function printScenario(page, check) {
  for (let n = 1; n <= 6; n++) {
    await page.emulateMedia({ media: "screen" });
    await page.click(`[data-sample="${n}"]`);
    await page.waitForSelector(".sheet-host .sheet-block", { state: "attached" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A5", printBackground: false });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    check(`print: sheet ${n} is one A5 page`, pages === 1, `${pages} pages`);
    const info = await page.evaluate(() => ({ limits: document.querySelector(".sheet-host .sheet-limits")?.checkVisibility() ?? false, text: document.querySelector(".sheet-host .sheet-limits")?.textContent ?? "", size: parseFloat(getComputedStyle(document.querySelector(".sheet-host .sheet")).fontSize), bar: document.querySelector(".dev-bar")?.checkVisibility() ?? false, signLine: document.querySelector(".sheet-host .sign-line")?.checkVisibility() ?? false, named: [...document.querySelectorAll(".sheet-host .sheet-name")].every((n) => n.closest(".found")?.querySelector(".level")) }));
    check(`print: sheet ${n} has the strip of limits, 10 pt text, a signature line and nothing else`, info.limits && /5 %/.test(info.text) && info.size >= 13.3 && info.signLine && !info.bar && info.named, JSON.stringify(info));
  }
  await page.emulateMedia({ media: "screen" });
}

/** The comparison flow on a synthetic library: the proposal fills the form, the rules of each level, signing, and nothing stored. */
async function flowScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  await page.setInputFiles('input[data-library="files"]', [{ name: "alfa.jdx", buffer: jcamp("alfa", ALFA) }, { name: "beta.jdx", buffer: jcamp("beta", BETA) }, { name: "gamma.jdx", buffer: jcamp("gamma", GAMMA) }]);
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]", [{ name: "campione_beta.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("campione_beta", BETA) }]);
  await page.waitForSelector(".result[data-level]", { state: "attached", timeout: 20000 });
  await openSheet(page);
  check("flow: the proposal fills the form (level 2, first candidate)", (await page.isChecked('[data-fk="lvl-2"]')) && (await page.isChecked('[data-fk="pick-0"]')) && (await page.getAttribute(".sheet-preview .sheet", "data-draft")) === "1");
  await page.check('[data-fk="lvl-4"]');
  check("flow: level 4 needs two components, signing is off", await page.isDisabled('.panel-body [data-action="decision.sign"]'));
  await page.check('[data-fk="pick-1"]');
  check("flow: two components allow signing", await page.isEnabled('.panel-body [data-action="decision.sign"]'));
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
  await page.keyboard.press("f");
  await page.waitForFunction(() => document.querySelector(".sheet-preview .sheet")?.getAttribute("data-draft") === "0");
  check("flow: f signs; the result and the chip show level 4 decided", (await page.getAttribute(".result", "data-level")) === "4" && /Miscela/.test((await page.textContent('[data-chip="result"]')) ?? "") && /proposto: Probabile/.test((await page.textContent(".result .decided")) ?? ""));
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), idb: (await indexedDB.databases()).length }));
  check("flow: nothing of the decision or the sheet is stored", !/decision|sheet|draft|Beta|beta/.test(stored.local + stored.session) && stored.idb <= 1, JSON.stringify(stored));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("flow: after a reload no sheet, no decision, no result", (await page.locator(".sheet-block").count()) === 0 && (await page.locator(".result").count()) === 0);
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
  await draftScenario(page, check);
  await languageScenario(page, check);
  await talkScenario(page, check, axe);
  await printScenario(page, check);
  check("sheet: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await flowScenario(browser, base, check);
  await phoneScenario(browser, base, check);
}
