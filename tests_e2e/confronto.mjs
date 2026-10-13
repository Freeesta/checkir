// Comparison e2e: the automatic comparison, levels, alerts, rows, overlay and what is (not) stored, on synthetic spectra with a known answer.
import { alertViews, levelNumber } from "../web/alerts.js";

/** Lorentzian bands [centre, height, half-width] on 400-4000 cm-1, step 2, as a JCAMP XYPOINTS file. */
export function jcamp(title, bands) {
  const rows = [];
  for (let x = 400; x <= 4000; x += 2) {
    let y = 0.01;
    for (const [c, h, w] of bands) y += h / (1 + ((x - c) / w) ** 2);
    rows.push(`${x}, ${y.toFixed(6)}`);
  }
  return Buffer.from(["##TITLE=" + title, "##JCAMP-DX=4.24", "##DATA TYPE=INFRARED SPECTRUM", "##XUNITS=1/CM", "##YUNITS=ABSORBANCE", "##XFACTOR=1", "##YFACTOR=1", `##NPOINTS=${rows.length}`, "##XYPOINTS=(XY..XY)", ...rows, "##END=", ""].join("\n"));
}

export const ALFA = [[700, 0.6, 12], [1000, 0.9, 14], [1250, 0.5, 10], [1500, 0.7, 16], [2900, 0.4, 20]];
export const BETA = [[800, 0.5, 12], [1100, 0.8, 14], [1350, 0.9, 10], [1650, 0.6, 16], [3000, 0.5, 20]];
export const GAMMA = [[750, 0.7, 12], [1200, 0.6, 14], [1450, 0.8, 10], [1700, 0.5, 16], [3100, 0.3, 20]];
export const ALFA_BIS = [...ALFA, [1600, 0.03, 10]];
const OTHER = [[900, 0.7, 10], [1050, 0.5, 12], [1550, 0.9, 12], [1800, 0.6, 12], [3400, 0.6, 25]];

/** Level and alert views from a hand-made result, no browser. */
export async function matchPureScenario(check) {
  const data = { level_proposed: "probable", candidates: new Array(10).fill({}), alerts: [{ id: "same_as_previous", data: { r: 0.99 } }] };
  check("match: level numbers follow the proposed level", levelNumber(data) === 2 && levelNumber({ level_proposed: "to_check" }) === 3 && levelNumber({ level_proposed: "other" }) === 5);
  check("match: alerts are rows as the engine sends them", alertViews(data).length === 1 && alertViews(data)[0].id === "same_as_previous");
}

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

async function load(page, name, bands) {
  await page.setInputFiles("input[type=file]", [{ name, mimeType: "chemical/x-jcamp-dx", buffer: jcamp(name, bands) }]);
}

/** Wait for the result block of the active spectrum and return its level number. */
async function resultLevel(page) {
  await openPanel(page, "results");
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  return page.getAttribute(".result[data-level]", "data-level");
}

/** Rows: arrows move the selection, the chemist's mark is only in memory, "scarto" folds the row, the overlay adds a column. */
async function rowsScenario(page, check, axe) {
  await page.focus('[data-fk="cand-0"]');
  await page.keyboard.press("ArrowDown");
  check("match: ArrowDown selects the next row", (await page.getAttribute('[data-fk="cand-1"]', "aria-current")) === "true");
  await page.click('[data-fk="lab-1-reject"]');
  check("match: reject folds the row", (await page.getAttribute(".cand:nth-child(2)", "data-label")) === "reject");
  await page.click('[data-fk="lab-1-reject"]');
  check("match: clicking the same mark clears it", (await page.getAttribute(".cand:nth-child(2)", "data-label")) === "");
  await page.click('[data-fk="lab-0-accept"]');
  check("match: the chosen candidate is overlaid by itself, as a dashed curve with a table column", (await page.locator("#chart polyline.curve-reference").count()) === 1 && /Riferimento/.test((await page.textContent("#table thead")) ?? ""));
  await page.keyboard.press("r");
  check("match: r takes the overlay off and back", (await page.locator("#chart polyline.curve-reference").count()) === 0);
  await page.keyboard.press("r");
  check("match: r puts the overlay back", (await page.locator("#chart polyline.curve-reference").count()) === 1);
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), idb: (await indexedDB.databases()).length }));
  check("match: marks are not in localStorage or IndexedDB", !/accept|reject|unsure/.test(stored.local) && stored.idb === 0, JSON.stringify(stored));
  const v2 = await axe(page);
  check("match: axe has no violations with the overlay", v2.length === 0, v2.join(", "));

}

/** Other known answers: two near-identical references (ambiguous), nothing alike (not identified), English. */
async function levelsScenario(page, check) {
  // Two near-identical library spectra -> not a sure identification, with the reason.
  await load(page, "campione_alfa.jdx", ALFA);
  await page.waitForFunction(() => document.querySelector(".result")?.getAttribute("data-level") === "3", null, { timeout: 20000 });
  check("match: ambiguous sample -> Da verificare with the ambiguity alert", (await page.locator('.alert[data-alert="ambiguity"]').count()) === 1);

  // Nothing alike -> "not identified", the list is titled "I più simili".
  await load(page, "campione_altro.jdx", OTHER);
  await page.waitForFunction(() => document.querySelector(".result")?.getAttribute("data-level") === "5", null, { timeout: 20000 });
  check("match: unknown sample -> Non identificato, titled 'I più simili'", /più simili/i.test((await page.textContent(".cands-title")) ?? ""));

  // English.
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  check("match: English shows the level word", /Not identified/.test((await page.textContent(".result .level")) ?? ""));
  await page.click('[data-lang="it"]');
  await page.waitForFunction(() => document.documentElement.lang === "it");

}

/** @param {import("playwright").Browser} browser */
export async function matchScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  // Every announcement is recorded: the live region keeps only the last one, and another message (a library import) may land after the result's.
  await page.evaluate(() => {
    window.__said = [];
    new MutationObserver(() => document.getElementById("status")?.textContent && window.__said.push(document.getElementById("status").textContent)).observe(document.getElementById("status"), { childList: true, characterData: true, subtree: true });
  });
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "alfa.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa", ALFA) },
    { name: "beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) },
    { name: "gamma.jdx", mimeType: "application/octet-stream", buffer: jcamp("gamma", GAMMA) },
    { name: "alfa_bis.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa_bis", ALFA_BIS) },
  ]);
  await page.locator('[data-library="sintetica"]').waitFor();
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));

  // A known answer: the sample is beta -> "Probabile", first row beta, every row names its library.
  await load(page, "campione_beta.jdx", BETA);
  check("match: starts by itself, level Probabile", (await resultLevel(page)) === "2");
  await openPanel(page, "results");
  const first = (await page.locator(".cand .cand-name").first().textContent()) ?? "";
  check("match: the first candidate is beta", /beta/i.test(first), first);
  check("match: every row shows its library", (await page.locator(".cand .cand-lib").allTextContents()).every((x) => x === "sintetica"));
  check("match: a name never stands outside a block with the level", await page.evaluate(() => [...document.querySelectorAll(".cand-name")].every((n) => n.closest(".result")?.querySelector(".level"))));
  check("match: header chip shows the tier and level word", /T2 · Probabile/.test((await page.textContent('[data-chip="result"]')) ?? ""));
  check("match: no fixed strip of warnings in the work area", (await page.locator("#limits").count()) === 0);
  const said = () => page.evaluate(() => window.__said);
  await page.waitForFunction(() => window.__said.some((t) => /\d+ candidat\w*, T2 · Probabile, \d+ allert\w*/.test(t)), null, { timeout: 15000 }).catch(() => {});
  check("match: announcement says candidates, level and alerts", (await said()).some((t) => /\d+ candidat\w*, T2 · Probabile, \d+ allert\w*/.test(t)), JSON.stringify(await said()));
  check("match: the zone left out is drawn and named", (await page.locator("#chart rect.excluded").count()) === 1 && /Escluso dal confronto/.test((await page.textContent("#chart")) ?? ""));
  const v1 = await axe(page);
  check("match: axe has no violations with a result", v1.length === 0, v1.join(", "));

  await rowsScenario(page, check, axe);
  await levelsScenario(page, check);
  // Switching the automatic comparison off: a new spectrum has no result until `c`.
  await page.click('[data-action="info.open"]');
  await page.uncheck("#auto-match-switch");
  await page.click("dialog .dialog-head button");
  await page.waitForSelector("dialog", { state: "detached" });
  await load(page, "campione_gamma.jdx", GAMMA);
  await page.waitForTimeout(1500);
  check("match: with autoMatch off nothing starts by itself", (await page.locator(".result").count()) === 0 && (await page.evaluate(() => localStorage.getItem("checkir.autoMatch"))) === "off");
  await page.keyboard.press("c");
  check("match: c runs it", (await resultLevel(page)) === "2");

  // Closing every file empties the results.
  for (let i = 0; i < 6; i++) await page.evaluate(() => document.querySelector('[data-action="file.close"]:not([disabled])')?.click());
  await page.waitForFunction(() => document.querySelectorAll(".result").length === 0);
  check("match: closing the files drops the results", true);
  check("match: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();

  // Phone width: no horizontal scroll.
  const phone = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const p = await phone.newPage();
  await p.goto(base);
  await p.waitForSelector("body[data-ready='1']");
  await p.setInputFiles("input[type=file]", [{ name: "x.jdx", mimeType: "application/octet-stream", buffer: jcamp("x", BETA) }]);
  await p.waitForSelector(".result", { timeout: 20000 }).catch(() => {});
  check("match: 320 px has no horizontal scroll with a result", await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.close();
}

