// Peaks and regions e2e: which peaks the chosen candidate explains, the IR regions with their agreement, the chart marks and the tables, on synthetic spectra with known bands.
import { BETA, GAMMA, ALFA, ALFA_BIS, jcamp } from "./confronto.mjs";

/** The sample is beta plus one band (2650 cm-1) that no library spectrum has. */
const BETA_PLUS = [...BETA, [2650, 0.5, 12]];

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

async function prepare(browser, base) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  const file = (name, bands) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) });
  await page.setInputFiles('input[data-library="files"]', [file("alfa", ALFA), file("beta", BETA), file("gamma", GAMMA), file("alfa_bis", ALFA_BIS)]);
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]", [{ name: "campione.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("campione", BETA_PLUS) }]);
  await openPanel(page, "results");
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  return { ctx, page, errors };
}

/** Section 4: counts, the unexplained peak, the regions with words, the tolerance note. */
async function panelScenario(page, check) {
  await openPanel(page, "peaks");
  await page.waitForSelector(".peak-item");
  const states = await page.$$eval(".peak-item", (b) => b.map((x) => [x.dataset.state, x.textContent]));
  const unexplained = states.filter(([s]) => s === "unexplained");
  check("peaks: the band the library lacks is the only one not explained", unexplained.length === 1 && /~26[4-6]\d/.test(unexplained[0][1]), JSON.stringify(states));
  check("peaks: the five known bands are explained", states.filter(([s]) => s === "explained").length === 5, JSON.stringify(states));
  const summary = (await page.textContent('details[data-panel="peaks"] summary')) ?? "";
  check("peaks: the closed section shows ● and ○ counts", /●\s*5\s*○\s*1/.test(summary), summary);
  check("peaks: four regions, each with a word", (await page.locator(".regions li").count()) === 4 && (await page.locator(".regions li").allTextContents()).every((x) => /Concorda|Non concorda|Non valutata/.test(x)));
  check("peaks: the candidate is named with its level in the same block", (await page.locator(".peaks-ref .level").count()) === 1 && /sintetica/i.test((await page.textContent(".peaks-ref")) ?? ""));
}

/** The chart: nothing until `p`, then regions (patterns), markers, tables; a click on a peak highlights it. */
async function chartScenario(page, check, axe) {
  check("peaks: the chart has no marks until asked", (await page.locator("#chart rect.region").count()) === 0 && (await page.locator("#table table").count()) === 1);
  await page.keyboard.press("p");
  check("peaks: p shows four regions and six markers", (await page.locator("#chart rect.region").count()) === 4 && (await page.locator("#chart circle.peak").count()) === 6);
  check("peaks: filled for explained, hollow for not explained", (await page.locator("#chart circle.peak-explained").count()) === 5 && (await page.locator("#chart circle.peak-unexplained").count()) === 1);
  const fills = await page.$$eval("#chart rect.region", (r) => r.map((x) => getComputedStyle(x).fill));
  check("peaks: a region is told by a pattern, not a plain colour", fills.some((f) => /url\(/.test(f)), fills.join(" | "));
  check("peaks: every region and peak is also in the tables", (await page.locator("#table table").count()) === 3 && (await page.locator("#table table").nth(1).locator("tbody tr").count()) === 4 && (await page.locator("#table table").nth(2).locator("tbody tr").count()) === 6);
  check("peaks: the toggle is pressed", (await page.getAttribute('details[data-panel="peaks"] [data-action="peaks.toggle"]', "aria-pressed")) === "true");
  await page.click('.peak-item[data-state="unexplained"]');
  check("peaks: a click on a peak highlights it with its position", (await page.locator("#chart circle.peak-focus").count()) === 1 && /~26\d\d/.test((await page.textContent("#chart text.peak-label")) ?? ""));
  const v = await axe(page);
  check("peaks: axe has no violations with regions and peaks", v.length === 0, v.join(", "));
  await page.click('.peak-item[data-state="unexplained"]');
  check("peaks: a second click removes the highlight", (await page.locator("#chart circle.peak-focus").count()) === 0);
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), idb: (await indexedDB.databases()).length }));
  check("peaks: nothing about peaks is stored", !/peak|picch|region/i.test(stored.local) && stored.idb === 0, JSON.stringify(stored));
}

/** English, switching off, and the phone width. */
async function languageScenario(page, check) {
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  check("peaks: English words", /Agrees|Does not agree|Not assessed/.test((await page.textContent(".regions")) ?? "") && /Not explained/.test((await page.textContent("#table")) ?? ""));
  await page.click('[data-lang="it"]');
  await page.waitForFunction(() => document.documentElement.lang === "it");
  await page.keyboard.press("p");
  check("peaks: p again hides regions and markers", (await page.locator("#chart rect.region").count()) === 0 && (await page.locator("#chart circle.peak").count()) === 0 && (await page.locator("#table table").count()) === 1);
}

/** @param {import("playwright").Browser} browser */
export async function peaksScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await prepare(browser, base);
  await panelScenario(page, check);
  await chartScenario(page, check, axe);
  await languageScenario(page, check);
  check("peaks: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  const phone = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const p = await phone.newPage();
  await p.goto(base);
  await p.waitForSelector("body[data-ready='1']");
  await p.setInputFiles("input[type=file]", [{ name: "x.jdx", mimeType: "application/octet-stream", buffer: jcamp("x", BETA) }]);
  await p.keyboard.press("p");
  await p.click("#tabbar [data-goto='peaks']");
  check("peaks: 320 px has no horizontal scroll with regions and peaks", await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.close();
}
