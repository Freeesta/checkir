// Sheets e2e, second part: a synthetic sheet with the thirteen sections (tests/fixture/schede, served in place of schede/), the sheets page
// (list, search, filter, one sheet, a family, keyboard, 320 px, print), the brief sheet inside the results and the hook from a private library.
import { collect } from "../tools/genera_schede.mjs";
import { REASSURING } from "./schede.mjs";
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";

const FIXTURE = new URL("../tests/fixture/schede/data/", import.meta.url);

/** Serves the fixture bundles in place of schede/ (the service worker is blocked in these contexts, or it would answer first). @param {import("playwright").Page} page */
async function serveFixture(page) {
  const files = await collect(FIXTURE);
  await page.route((url) => /^\/schede\/[^/]+$/.test(url.pathname), (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const body = files.get(name);
    if (body === undefined) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: name.endsWith(".svg") ? "image/svg+xml" : "application/json", body });
  });
}

/** @param {import("playwright").Browser} browser @param {string} base @param {number} width */
async function newPage(browser, base, width = 1366) {
  const ctx = await browser.newContext({ locale: "it-IT", serviceWorkers: "block", viewport: { width, height: width > 600 ? 900 : 700 } });
  const page = await ctx.newPage();
  const seen = { errors: /** @type {string[]} */ ([]), foreign: /** @type {string[]} */ ([]) };
  page.on("pageerror", (e) => seen.errors.push(String(e)));
  page.on("request", (r) => { if (!r.url().startsWith(new URL(base).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) seen.foreign.push(r.url()); });
  await serveFixture(page);
  return { ctx, page, seen };
}

/** The list: both sheets, the search by name or synonym, the class filter, keyboard to a sheet. */
async function listScenario(page, base, check) {
  await page.goto(`${base}pagine/schede/`);
  await page.waitForSelector("body[data-page='sheets'][data-ready='1']");
  check("sheets page: the list holds the two fixture sheets and the family", (await page.locator(".sheet-entry").count()) === 2 && (await page.locator(".family-list a").count()) === 1);
  check("sheets page: each entry says how many sections are written", /11 sezioni scritte su 13/.test((await page.textContent('.sheet-entry[data-sheet="synthetic-full"]')) ?? ""));
  await page.fill("#sheet-search", "full sheet syn");
  check("sheets page: search finds a synonym", (await page.locator(".sheet-entry").count()) === 1 && (await page.getAttribute(".sheet-entry", "data-sheet")) === "synthetic-full");
  await page.fill("#sheet-search", "zzz");
  check("sheets page: nothing found says so", /Nessuna scheda corrisponde/.test((await page.textContent("main")) ?? ""));
  await page.fill("#sheet-search", "");
  await page.selectOption("#sheet-class", "example_family");
  check("sheets page: the class filter keeps the sheets of that class", (await page.locator(".sheet-entry").count()) === 2);
  await page.focus(".sheet-entry a");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".substance-sheet");
  check("sheets page: Enter opens the sheet and the focus goes to its title", await page.evaluate(() => document.activeElement?.id === "sheet-title"));
}

/** The thirteen sections of the fixture sheet and what each one shows. */
async function sheetScenario(page, check, axe) {
  const text = (await page.textContent(".substance-sheet")) ?? "";
  check("sheets page: thirteen sections, with no state tag", (await page.locator(".sheet-section").count()) === 13 && (await page.locator(".sheet-section .state-tag").count()) === 0);
  check("sheets page: version line counts the written sections", /sezioni scritte: 11 su 13/.test(text), text.slice(0, 120));
  check("sheets page: the unwritten history says so, the family fills effects with its own label", (await page.locator("[data-empty]").count()) === 1 && (await page.locator('[data-section="effects"] [data-family-text]').count()) === 1 && /Famiglia di esempio/.test((await page.textContent('[data-section="effects"]')) ?? ""));
  await page.waitForSelector("svg.structure-svg");
  check("sheets page: identity is copyable and the structure is an inline drawing without styles", (await page.locator(".sheet-identity .copy-btn").count()) === 2 && (await page.locator("svg.structure-svg [style]").count()) === 0 && (await page.getAttribute("svg.structure-svg", "role")) === "img");
  check("sheets page: origin is data", (await page.locator('[data-part="origin"]').count()) === 1);
  check("sheets page: metabolism has a tree and, beside it, the tables", (await page.locator(".metabolism-tree li").count()) >= 2 && (await page.locator('[data-part="metabolism-pathways"] tbody tr').count()) === 2 && (await page.locator('[data-part="metabolism-metabolites"] tbody tr').count()) === 2);
  check("sheets page: the half-life is a range with the decimal point", /0\.7–1\.5 h/.test((await page.textContent('[data-part="half-life"]')) ?? ""));
  check("sheets page: the cuts say what the program computes", (await page.getAttribute('tr[data-cut="synthetic-cut-a"]', "data-detectable")) === "1" && (await page.getAttribute('tr[data-cut="synthetic-cut-b"]', "data-detectable")) === "0" && (await page.getAttribute('tr[data-cut="synthetic-cut-a"]', "data-found")) === "0");
  check("sheets page: each talking point carries its topic", (await page.locator('[data-section="counselling"] [data-topic]').count()) === 2);
  check("sheets page: interactions are a table with a severity word", /risky|a rischio/.test((await page.textContent('[data-part="interactions"]')) ?? ""));
  check("sheets page: no raw citation marker and nothing that reassures", !/\[f:/.test(text) && !REASSURING.test(text));
  const v = await axe(page);
  check("sheets page: axe has no violations on a sheet", v.length === 0, v.join(", "));
}

/** The family sheet, the language, 320 px and print. */
async function aroundScenario(page, check, axe) {
  await page.click('[data-fk="sheets-back"]');
  await page.waitForSelector(".sheet-list");
  await page.click(".family-list a");
  await page.waitForSelector(".family-sheet");
  check("sheets page: a family sheet has its six sections", (await page.locator(".family-sheet .sheet-section").count()) === 6 && (await page.locator('.family-sheet [data-part="interactions"]').count()) === 1);
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  check("sheets page: English titles", /Substance sheets|Example family/.test((await page.textContent("main")) ?? "") && /Effects/.test((await page.textContent(".family-sheet")) ?? ""));
  await page.setViewportSize({ width: 320, height: 700 });
  check("sheets page: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const v = await axe(page);
  check("sheets page: axe has no violations at 320 px", v.length === 0, v.join(", "));
  await page.emulateMedia({ media: "print" });
  check("sheets page: print drops the header, the filters and the edit buttons", await page.evaluate(() => getComputedStyle(document.querySelector(".app-header")).display === "none"));
}

/** @param {import("playwright").Browser} browser */
export async function sheetsPageScenario(browser, base, check, axe) {
  const { ctx, page, seen } = await newPage(browser, base);
  await listScenario(page, base, check);
  await sheetScenario(page, check, axe);
  await aroundScenario(page, check, axe);
  check("sheets page: no request to another origin and no page errors", seen.foreign.length === 0 && seen.errors.length === 0, [...seen.foreign, ...seen.errors].join(" | "));
  await ctx.close();
}

/** A private library with the given spectra, the sample, and the first result. */
async function analyse(page, base, spectra, sample) {
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => {
    window.__said = [];
    new MutationObserver(() => document.getElementById("status")?.textContent && window.__said.push(document.getElementById("status").textContent)).observe(document.getElementById("status"), { childList: true, characterData: true, subtree: true });
  });
  const panel = page.locator('details[data-panel="libraries"]');
  if (!(await panel.evaluate((d) => d.open))) await panel.locator("summary").click();
  await page.fill("#lib-name", "Privata");
  await page.setInputFiles('input[data-library="files"]', spectra.map(([title, bands]) => ({ name: `${title}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(title, bands) })));
  await page.waitForFunction((n) => new RegExp(String(n)).test(document.querySelector('[data-library="privata"]')?.textContent ?? ""), spectra.length);
  await page.setInputFiles("input[type=file]:not([data-library])", [{ name: "campione.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("campione", sample) }]);
  await page.waitForSelector(".result[data-level]", { state: "attached", timeout: 20000 });
}

/** The brief sheet inside the results: both audiences, the announcement, the level rules, talk mode. */
export async function inlineScenario(browser, base, check, axe) {
  const { ctx, page, seen } = await newPage(browser, base);
  await analyse(page, base, [["Synthetic full sheet", ALFA], ["Synthetic cut A", BETA], ["gamma", GAMMA]], ALFA);
  await page.waitForSelector('.inline-panel[data-sheet="synthetic-full"] .audience-toggle');
  check("inline sheet: a private library entry named like a sheet hooks to it, at a level 1-3 one sheet", (await page.locator(".inline-sheet").count()) === 1 && (await page.locator(".inline-panel").count()) === 1);
  check("inline sheet: the sheet name stands beside the level and the written sections", /Scheda: Scheda sintetica completa/.test((await page.textContent(".inline-head")) ?? "") && (await page.locator(".inline-head .level").count()) === 1 && /11 sezioni scritte su 13/.test((await page.textContent(".inline-head")) ?? ""));
  check("inline sheet: Chemist is the first view, with the metabolism tree and the cuts", (await page.getAttribute('[data-audience="chemist"]', "aria-pressed")) === "true" && (await page.locator('.inline-panel [data-part="metabolism-tree"]').count()) === 1 && (await page.locator('.inline-panel [data-part="cuts"]').count()) === 1);
  check("inline sheet: the availability was announced", (await page.evaluate(() => window.__said)).some((m) => /Scheda di Scheda sintetica completa disponibile/.test(m)));
  await page.click('[data-audience="counsellor"]');
  check("inline sheet: the Counsellor view shows the talking points with their topics and the family text", (await page.getAttribute('[data-audience="counsellor"]', "aria-pressed")) === "true" && (await page.locator('.inline-panel [data-topic]').count()) === 2 && (await page.locator('.inline-panel [data-section="effects"] [data-family-text]').count()) === 1);
  check("inline sheet: an unwritten section is left out of the brief view", (await page.locator('.inline-panel [data-section="history"]').count()) === 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const v = await axe(page);
  check("inline sheet: axe has no violations with the brief sheet", v.length === 0, v.join(", "));
  await page.click('[data-fk="inline-open-sheet"]');
  await page.waitForSelector("dialog .substance-sheet");
  check("inline sheet: the full sheet opens from it, with a link to the page", (await page.locator("dialog .sheet-section").count()) === 13 && (await page.locator('dialog [data-fk="sheet-page"]').count()) === 1);
  await page.keyboard.press("Escape");
  await levelRules(page, check);
  await page.setViewportSize({ width: 320, height: 700 });
  check("inline sheet: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check("inline sheet: no request to another origin and no page errors", seen.foreign.length === 0 && seen.errors.length === 0, [...seen.foreign, ...seen.errors].join(" | "));
  await ctx.close();
}

/** Level 5 shows no sheet, level 4 one sheet per component in tabs that the arrows move between, talk mode adds the counselling points. */
async function levelRules(page, check) {
  const section = page.locator('details[data-panel="sheet"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  await page.check('[data-fk="lvl-4"]');
  const other = await page.evaluate(() => [...document.querySelectorAll('[data-fk^="pick-"]')].find((i) => /Synthetic cut A/.test(i.closest("label")?.textContent ?? i.parentElement?.textContent ?? ""))?.getAttribute("data-fk"));
  await page.check('[data-fk="pick-0"]');
  if (other) await page.check(`[data-fk="${other}"]`);
  await page.waitForFunction(() => document.querySelectorAll(".inline-panel").length === 2);
  check("inline sheet: level 4 gives one tab per component with a sheet", (await page.locator('.inline-tabs [role="tab"]').count()) === 2 && (await page.locator('.inline-panel:not([hidden])').count()) === 1);
  await page.focus('.inline-tabs [role="tab"]');
  await page.keyboard.press("ArrowRight");
  check("inline sheet: the arrow keys move between the tabs", (await page.locator('.inline-tabs [role="tab"][aria-selected="true"]').getAttribute("id")) === "inline-tab-synthetic-cut-a");
  await page.check('[data-fk="lvl-5"]');
  await page.waitForFunction(() => document.querySelectorAll(".inline-sheet").length === 0);
  check("inline sheet: level 5 shows no sheet", true);
  await page.check('[data-fk="lvl-2"]');
  await page.check('[data-fk="pick-0"]');
  await page.waitForSelector(".inline-sheet");
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
  await page.keyboard.press("m");
  await page.waitForSelector(".sheet-host .sheet-counselling:not([hidden])");
  const talk = await page.evaluate(() => ({ points: document.querySelectorAll(".sheet-host .sheet-counselling [data-topic]").length, size: parseFloat(getComputedStyle(document.querySelector(".sheet-host .sheet-counselling p")).fontSize) }));
  check("talk: the counselling points of the sheet are in big letters", talk.points === 2 && talk.size >= 20, JSON.stringify(talk));
  await page.emulateMedia({ media: "print" });
  check("print: the counselling block of talk mode is not printed", await page.evaluate(() => getComputedStyle(document.querySelector(".sheet-counselling")).display === "none"));
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
}

/** The real sheets of data/ (no fixture): «Cocaine HCl» in the user's own library hooks the cocaine sheet; a name no sheet knows hooks nothing. */
export async function hookScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await analyse(page, base, [["Cocaine HCl", ALFA], ["beta", BETA], ["gamma", GAMMA]], ALFA);
  await page.waitForSelector('.inline-panel[data-sheet="cocaine"]');
  check("hook: «Cocaine HCl» in a private library hooks the cocaine sheet", (await page.locator('[data-fk="open-sheet"]').count()) === 1);
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("dialog .substance-sheet");
  check("hook: the dialog is the cocaine sheet with thirteen sections", (await page.getAttribute("dialog .substance-sheet", "data-substance")) === "cocaine" && (await page.locator("dialog .sheet-section").count()) === 13);
  await ctx.close();
}
