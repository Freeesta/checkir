// Peaks and regions e2e: which peaks the chosen candidate explains, the IR regions with their agreement, the chart marks and the tables, on synthetic spectra with known bands.
import { BETA, GAMMA, ALFA, ALFA_BIS, jcamp } from "./confronto.mjs";

/** The sample is beta plus one band (2650 cm-1) that no library spectrum has. */
const BETA_PLUS = [...BETA, [2650, 0.5, 12]];

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

export async function prepare(browser, base) {
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
  check("peaks: the chart has no marks until asked", (await page.locator("#chart rect.region").count()) === 0 && (await page.locator("#table table").count()) === 1 && (await page.locator("#peaks-summary").isHidden()));
  await page.keyboard.press("p");
  check("peaks: p shows the ten regions of regions/1 and six markers", (await page.locator("#chart rect.region-band").count()) === 10 && (await page.locator("#chart .peak").count()) === 6);
  check("peaks: filled for explained, hollow for not explained", (await page.locator("#chart circle.peak-explained").count()) === 5 && (await page.locator("#chart circle.peak-unexplained").count()) === 1);
  const fills = await page.$$eval("#chart rect.region", (r) => r.map((x) => getComputedStyle(x).fill));
  check("peaks: every region is told by a pattern, not a plain colour", fills.length === 10 && fills.every((f) => /url\(/.test(f)), fills.join(" | "));
  const patterns = await page.$$eval("#chart rect.region", (r) => new Set(r.map((x) => x.getAttribute("fill"))).size);
  check("peaks: the families differ by pattern (eight patterns)", patterns === 8, String(patterns));
  check("peaks: the instrument zone says so", /strumento/i.test((await page.textContent('#chart text[data-region-label="instrument"]')) ?? ""));
  check("peaks: every region and peak is also in the tables", (await page.locator("#table table").count()) === 3 && (await page.locator("#table table").nth(1).locator("tbody tr").count()) === 10 && (await page.locator("#table table").nth(2).locator("tbody tr").count()) === 6);
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

/** The summary above the chart, the sortable table, the arrows between peaks and Esc. */
async function viewScenario(page, check, axe) {
  await page.evaluate(() => (document.getElementById("table-section").open = true)); // the data table is folded by default
  const summary = (await page.textContent("#peaks-summary")) ?? "";
  check("peaks: the summary counts the main peaks and names the one not explained", /Picchi principali: 6 · spiegati da .*: 5 · non spiegati: 1 \(~26\d\d\)/.test(summary), summary);
  check("peaks: no reassuring word in the summary", !/sicur|pur[oa]|pulit/i.test(summary), summary);
  const chartPeaks = await page.$$eval("#chart [data-peak]", (n) => n.map((x) => x.getAttribute("data-peak")).sort());
  const tablePeaks = await page.$$eval("#table table.peak-table tbody tr", (n) => n.map((x) => x.getAttribute("data-peak")).sort());
  check("peaks: the table has the same peaks as the chart", chartPeaks.length === 6 && JSON.stringify(chartPeaks) === JSON.stringify(tablePeaks), `${chartPeaks} | ${tablePeaks}`);
  const first = async () => (await page.textContent("#table table.peak-table tbody tr td")) ?? "";
  const before = await first();
  await page.click("#table table.peak-table th:nth-child(1) button");
  check("peaks: a click on a header sorts and marks aria-sort", (await page.getAttribute("#table table.peak-table th:nth-child(1)", "aria-sort")) === "ascending" && (await first()) !== before);
  check("peaks: the sort button keeps the focus", await page.evaluate(() => document.activeElement?.classList.contains("sort") ?? false));
  await page.click("#table table.peak-table th:nth-child(4) button");
  check("peaks: the table sorts by state too", (await page.getAttribute("#table table.peak-table th:nth-child(4)", "aria-sort")) === "ascending");
  await page.focus("#chart");
  await page.keyboard.press("ArrowRight");
  const one = await page.getAttribute("#chart circle.peak-focus", "data-peak");
  await page.keyboard.press("ArrowRight");
  const two = await page.getAttribute("#chart circle.peak-focus", "data-peak");
  check("peaks: → goes to the next peak, ← back", one !== null && two !== null && one !== two && (await (async () => { await page.keyboard.press("ArrowLeft"); return (await page.getAttribute("#chart circle.peak-focus", "data-peak")) === one; })()));
  await page.waitForTimeout(200);
  check("peaks: the focused peak is announced and marked in the table", /picco a circa \d+/.test((await page.textContent("#status")) ?? "") && (await page.locator("#table table.peak-table tr[aria-current]").count()) === 1);
  await page.keyboard.press("Escape");
  check("peaks: Esc clears the pick", (await page.locator("#chart .peak-focus").count()) === 0);
  const v = await axe(page);
  check("peaks: axe has no violations with the sorted table", v.length === 0, v.join(", "));
}

/** The peak card: facts, readings, level picker, source, other modes, the drawing of the mode (still under reduced motion) and Esc. */
async function cardScenario(page, check, axe) {
  const card = page.locator("#peak-card");
  check("card: nothing until a peak is picked", await card.isHidden());
  await page.click('.peak-item[data-state="explained"]');
  check("card: a picked peak opens its card with title and facts", (await card.isVisible()) && /Picco a ~?\d+/.test((await card.locator("h3").textContent()) ?? "") && (await card.locator(".card-facts dt").count()) === 4);
  check("card: the readings are at most three and say where they come from", (await card.locator(".reading").count()) <= 3 && (await card.locator(".reading-source").count()) === (await card.locator(".reading").count()));
  check("card: no generic caution text", !/decide la persona|diagnosi|ipotesi del programma/i.test((await card.textContent()) ?? ""));
  const names = await page.$$eval(".peak-item", (b) => b.map((x) => x.getAttribute("aria-label")));
  check("card: each peak button has the full accessible name", names.every((n) => /^picco a circa \d+/i.test(n ?? "")), JSON.stringify(names));
  const level = (l) => card.locator(`[data-level="${l}"]`);
  await level("chemist").click();
  check("card: the level picker sets the level and stores it", (await level("chemist").getAttribute("aria-pressed")) === "true" && (await page.evaluate(() => localStorage.getItem("checkir.textLevel"))) === "chemist");
  await level("chemist").focus();
  await page.keyboard.press("ArrowDown");
  check("card: ↓ goes to the next level and keeps the focus", (await level("teaching").getAttribute("aria-pressed")) === "true" && (await page.evaluate(() => document.activeElement?.getAttribute("data-level"))) === "teaching");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  check("card: ↑ goes back to the simplest and stops there", (await level("counsellor").getAttribute("aria-pressed")) === "true");
  await page.waitForTimeout(200);
  check("card: the level is announced", /Livello del testo/.test((await page.textContent("#status")) ?? ""));
  if (await card.locator("[data-rule-range]").count()) {
    await card.locator("[data-rule-range]").first().click();
    check("card: another mode of the group shows its window on the chart", (await page.locator("#chart rect.rule-range").count()) === 1 && /Finestra della regola/.test((await page.textContent("#chart text.rule-label")) ?? ""));
  }
  const fig = card.locator("figure.mode-figure");
  if (await fig.count()) check("card: the drawing of the mode moves in the normal case", (await fig.getAttribute("data-animated")) === "true" && (await card.locator('[data-card="mode-anim"]').count()) === 1);
  const v = await axe(page);
  check("card: axe has no violations with the card open", v.length === 0, v.join(", "));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click('.peak-item[data-state="explained"] >> nth=1');
  const still = page.locator("#peak-card figure.mode-figure");
  if (await still.count()) check("card: under reduced motion the drawing is still, two frames with arrows, no switch", (await still.getAttribute("data-animated")) === "false" && (await still.locator("text.label").count()) === 2 && (await page.locator('#peak-card [data-card="mode-anim"]').count()) === 0 && (await page.evaluate(() => document.getAnimations().length)) === 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.focus("#chart");
  await page.keyboard.press("Escape");
  check("card: Esc closes the card", await card.isHidden());
}

/** The width of a peak decides what the rules read: a broad synthetic band at 1050 is read as phosphate, a narrow one is not; the card gives the width in cm⁻¹. */
async function widthScenario(browser, base, check) {
  const readings = async (bands, name) => {
    const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
    await page.setInputFiles("input[type=file]", [{ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) }]);
    await page.keyboard.press("p");
    await openPanel(page, "peaks");
    await page.waitForSelector(".peak-item");
    await page.locator('.peak-item:has-text("~105")').first().click();
    const card = page.locator("#peak-card");
    await card.locator(".card-facts").waitFor();
    const out = { readings: (await card.locator(".reading").allTextContents()).join(" "), shape: (await card.locator(".card-facts dd").nth(1).textContent()) ?? "", names: await page.$$eval(".peak-item", (b) => b.map((x) => x.getAttribute("aria-label") ?? "")) };
    await ctx.close();
    return out;
  };
  const wide = await readings([[1050, 0.8, 45], [1700, 0.3, 6]], "larga");
  const sharp = await readings([[1050, 0.8, 4], [1700, 0.3, 6]], "stretta");
  check("width: a broad band at 1050 is read as phosphate", /Fosfato/.test(wide.readings), wide.readings);
  check("width: a narrow peak at 1050 is not", !/Fosfato/.test(sharp.readings), sharp.readings);
  check("width: the card gives the width in cm⁻¹ with the class", /^\d+\.\d cm⁻¹ a metà altezza \((largo|molto largo)\)$/.test(wide.shape.trim()), wide.shape);
  check("width: the accessible name has no double approximation", sharp.names.every((n) => !/circa ~/.test(n)), sharp.names.join(" | "));
}

/** A methylene sample: the drawing of the mode (moving, then still under reduced motion), another mode of the group on the chart, out-of-plane drawing. */
async function modeScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", [{ name: "metilene.jdx", mimeType: "application/octet-stream", buffer: jcamp("metilene", [[1465, 0.6, 12], [2920, 0.8, 14], [2850, 0.6, 10], [720, 0.4, 10]]) }]);
  await page.keyboard.press("p");
  await openPanel(page, "peaks");
  await page.waitForSelector(".peak-item");
  await page.locator('.peak-item:has-text("~1465")').click();
  const card = page.locator("#peak-card");
  await card.locator(".reading").first().waitFor();
  check("mode: the reading names the group and the mode", /Metilene · Forbice/.test((await card.locator(".reading").first().textContent()) ?? ""));
  const fig = card.locator("figure.mode-figure");
  check("mode: the drawing moves in the normal case, with a switch to stop it", (await fig.getAttribute("data-animated")) === "true" && (await card.locator('[data-card="mode-anim"]').getAttribute("aria-pressed")) === "true");
  await card.locator('[data-card="mode-anim"]').click();
  check("mode: stopping gives two still frames and remembers it", (await card.locator("figure.mode-figure").getAttribute("data-animated")) === "false" && (await page.evaluate(() => localStorage.getItem("checkir.modeAnim"))) === "off");
  await card.locator('[data-card="mode-anim"]').click();
  await card.locator("[data-rule-range]").first().click();
  check("mode: another mode of the group draws its window on the chart", (await page.locator("#chart rect.rule-range").count()) === 1 && /Finestra della regola \d+–\d+ cm⁻¹/.test((await page.textContent("#chart text.rule-label")) ?? ""));
  const v = await axe(page);
  check("mode: axe has no violations with the window on the chart", v.length === 0, v.join(", "));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('.peak-item:has-text("~2920")').click();
  const still = page.locator("#peak-card figure.mode-figure");
  check("mode: reduced motion gives two frames with arrows, no switch and nothing animated", (await still.getAttribute("data-animated")) === "false" && (await still.locator("text.label").count()) === 2 && (await still.locator("line.mode-arrow").count()) > 0 && (await page.locator('#peak-card [data-card="mode-anim"]').count()) === 0 && (await page.evaluate(() => document.getAnimations().length)) === 0);
  const oop = await page.evaluate(async () => {
    const { modeFigure } = await import("./mode_anim.js");
    const modes = (await (await fetch("bands/modes.json")).json()).modes;
    const wag = modes.find((m) => m.id === "wagging");
    const f = modeFigure(wag, { animate: true });
    return { animated: f?.animated, text: f?.node.textContent ?? "" };
  });
  check("mode: an out-of-plane motion is never animated and uses ⊙ and ⊗", oop.animated === false && oop.text.includes("⊙") && oop.text.includes("⊗"), JSON.stringify(oop));
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const en = await axe(page);
  check("mode: axe has no violations in English", en.length === 0, en.join(", "));
  check("mode: English card", /Peak at/.test((await card.textContent()) ?? "") && /Possible readings/.test((await card.textContent()) ?? ""));
  await ctx.close();
}

/** English, switching off, and the phone width. */
async function languageScenario(page, check, axe) {
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await axe(page);
  check("peaks: axe has no violations in the dark scheme", dark.length === 0, dark.join(", "));
  await page.emulateMedia({ colorScheme: "light" });
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const en = await axe(page);
  check("peaks: axe has no violations in English", en.length === 0, en.join(", "));
  check("peaks: English summary, names and table", /Main peaks: 6 · explained by .*: 5 · not explained: 1/.test((await page.textContent("#peaks-summary")) ?? "") && /Strong|Intensity/.test((await page.textContent("#table table.peak-table")) ?? "") && /Instrument zone/.test((await page.textContent("#table")) ?? ""));
  check("peaks: English words", /Agrees|Does not agree|Not assessed/.test((await page.textContent(".regions")) ?? "") && /Not explained/.test((await page.textContent("#table")) ?? ""));
  await page.click('[data-lang="it"]');
  await page.waitForFunction(() => document.documentElement.lang === "it");
  await page.keyboard.press("p");
  check("peaks: p again hides regions and markers", (await page.locator("#chart rect.region").count()) === 0 && (await page.locator("#chart .peak").count()) === 0 && (await page.locator("#table table").count()) === 1);
}

/** @param {import("playwright").Browser} browser */
export async function peaksScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await prepare(browser, base);
  await panelScenario(page, check);
  await chartScenario(page, check, axe);
  await viewScenario(page, check, axe);
  await cardScenario(page, check, axe);
  await languageScenario(page, check, axe);
  check("peaks: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await modeScenario(browser, base, check, axe);
  await widthScenario(browser, base, check);
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
