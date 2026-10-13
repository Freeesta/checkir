// Region e2e: choosing the part of the spectrum the comparison uses (fields, cursors, brush, presets), the candidate × region table, the chip, the alert and what is (not) stored.
import { readFile } from "node:fs/promises";
import { ALFA, BETA, GAMMA, ALFA_BIS, jcamp } from "./confronto.mjs";

/** Pure helpers: merging, the mask, the minimum width, the options, and the presets against the thresholds file. */
export async function rangesPureScenario(check) {
  const r = await import(new URL("../web/ranges.js", import.meta.url));
  check("ranges: overlapping ranges are merged and sorted", JSON.stringify(r.normalizeRanges([[1500, 1800], [700, 1000], [900, 1100], [5000, 4000]])) === JSON.stringify([[700, 1100], [1500, 1800]]));
  check("ranges: ranges are clipped to the grid", JSON.stringify(r.normalizeRanges([[100, 700], [3700, 4500]])) === JSON.stringify([[650, 700], [3700, 3800]]));
  check("ranges: 100 cm-1 is too narrow, with the engine's error key", r.narrowError([[1000, 1100]])?.key === "confronti.regione_troppo_stretta");
  check("ranges: the zone 1900-2400 never counts", r.narrowError([[1900, 2400]]) !== null && r.narrowError([[1500, 2600]]) === null && r.pointsIn([[1500, 2600]]) === 300);
  check("ranges: 650-1800 is wide enough", r.narrowError([[650, 1800]]) === null);
  check("ranges: options are a preset id or a list of ranges", JSON.stringify(r.optionsOf({ preset: "full", ranges: [] })) === '{"range_preset":"full"}' && JSON.stringify(r.optionsOf({ preset: null, ranges: [[650, 1800]] })) === '{"ranges":[[650,1800]]}');
  const file = JSON.parse(await readFile(new URL("../data/soglie_confronto.json", import.meta.url), "utf8"));
  const same = JSON.stringify(file.range_presets.map((p) => [p.id, p.ranges])) === JSON.stringify(r.PRESETS.map((p) => [p.id, p.ranges]));
  check("ranges: the page presets are the presets of soglie_confronto.json", same, JSON.stringify(file.range_presets));
  check("ranges: the page limits are the thresholds' limits", file.range_limits.min_cm1 === r.LIMITS.minCm1 && file.range_limits.min_points === r.LIMITS.minPoints);
}

/** Open a section: the tab bar on a phone, the summary otherwise. */
async function openPanel(page, name) {
  const tab = page.locator(`#tabbar [data-goto="${name}"]`);
  if (await tab.isVisible()) return tab.click();
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** Fill the two new-region fields with the keyboard and press the add button with Enter. */
async function addByKeyboard(page, from, to) {
  await page.focus('[data-fk="range-new-from"]');
  await page.keyboard.type(String(from));
  await page.keyboard.press("Tab");
  await page.keyboard.type(String(to));
  await page.keyboard.press("Tab");
  await page.focus('[data-fk="range-add"]');
  await page.keyboard.press("Enter");
}

async function setup(browser, base, locale = "it-IT", viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ locale, viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  const files = [["alfa", ALFA], ["beta", BETA], ["gamma", GAMMA], ["alfa_bis", ALFA_BIS]];
  await page.setInputFiles('input[data-library="files"]', files.map(([n, b]) => ({ name: `${n}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(n, b) })));
  await page.locator('[data-library="sintetica"]').waitFor();
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]:not([data-library])", [{ name: "beta.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("beta", BETA) }]);
  await openPanel(page, "results");
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  return { ctx, page, errors };
}

/** Numeric fields, keyboard only: the region is used, the chip, the alert, the cap, the chart zones and the table. */
async function fieldsScenario(page, check) {
  check("ranges: the picker is not always in view", (await page.locator("fieldset.ranges").count()) === 0);
  await page.focus("body");
  await page.keyboard.press("g");
  check("ranges: g shows the picker in section 3, on the whole spectrum", (await page.locator("fieldset.ranges").count()) === 1 && (await page.getAttribute('[data-fk="range-preset-full"]', "aria-pressed")) === "true");
  check("ranges: with the whole range no chip mark and the table asks to choose regions", (await page.locator("[data-chip-region]").count()) === 0 && (await page.locator(".ranges-table").count()) === 0);
  await addByKeyboard(page, 650, 1800);
  await page.waitForFunction(() => document.querySelector(".result [data-alert='custom_range']"), null, { timeout: 20000 });
  check("ranges: a hand-picked region shows the alert custom_range", (await page.locator('.alert[data-alert="custom_range"]').count()) === 1);
  check("ranges: the level is capped at «da verificare»", Number(await page.getAttribute(".result", "data-level")) >= 3);
  check("ranges: the chip gets the region icon", (await page.locator("[data-chip-region]").count()) === 1);
  check("ranges: the result says which region it used", /650/.test((await page.textContent("[data-used-range]")) ?? "") && /1\.?800/.test((await page.textContent("[data-used-range]")) ?? ""));
  await page.waitForSelector(".ranges-table tbody tr", { timeout: 20000 });
  await page.waitForFunction(() => !/Calcolo in corso/.test(document.querySelector(".ranges-table")?.textContent ?? ""), null, { timeout: 20000 });
  const heads = await page.locator(".ranges-table thead th").allTextContents();
  check("ranges: the table has candidate, whole and region 1", heads.length === 3 && /Intero/.test(heads[1]) && /Regione 1/.test(heads[2]), heads.join(" | "));
  const cells = await page.locator(".ranges-table tbody td").allTextContents();
  check("ranges: every cell has its number and a word, never colour alone", cells.length >= 3 && cells.every((c) => /\d[.,]\d\d · \S/.test(c) || /fuori dai primi/.test(c)), cells.slice(0, 4).join(" | "));
  const first = await page.locator(".ranges-table tbody tr").first().textContent();
  check("ranges: the first row is the best candidate (beta) and agrees on the whole range", /beta/i.test(first ?? "") && /Concorda/.test(first ?? ""), first ?? "");
  check("ranges: the chart draws a light band under the axis with the region number", (await page.locator("#chart rect.range-band").count()) === 1 && /Regione 1/.test((await page.textContent("#chart")) ?? ""));
  check("ranges: the left-out zone is still there", (await page.locator("#chart rect.excluded").count()) === 1);
}

/** The error under 400 cm-1, the cursors as keyboard brush, removal, and the key g. */
async function errorsScenario(page, check) {
  await page.click('[data-fk="range-clear"]');
  await page.waitForFunction(() => document.querySelector("[data-chip-region]") === null, null, { timeout: 20000 });
  await addByKeyboard(page, 1000, 1100);
  await page.waitForSelector(".ranges .error", { timeout: 5000 });
  const text = (await page.textContent(".ranges .error")) ?? "";
  check("ranges: a region under 400 cm-1 gives a translated error with the numbers", /troppo strette/.test(text) && /400/.test(text) && /150/.test(text) && !/confronti\./.test(text), text);
  await page.click('[data-fk="range-clear"]');
  await page.focus("#chart");
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  for (let i = 0; i < 40; i++) await page.keyboard.press(">");
  await page.focus('[data-fk="range-cursors"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector(".range-list li", { timeout: 5000 });
  check("ranges: two cursors set from the keyboard make a region", (await page.locator(".range-list li").count()) === 1);
  await page.click('[data-fk="range-remove-0"]');
  await page.waitForFunction(() => document.querySelector(".range-list") === null);
  check("ranges: removing the last region goes back to the whole spectrum", (await page.getAttribute('[data-fk="range-preset-full"]', "aria-pressed")) === "true");
  await page.focus("body");
  await page.keyboard.press("g");
  check("ranges: g hides the picker again", (await page.locator("fieldset.ranges").count()) === 0);
  await page.keyboard.press("g");
  check("ranges: g shows it and moves the focus into it", await page.evaluate(() => document.activeElement?.closest("fieldset.ranges") !== null));
}

/** The brush on the x axis: a drag in the strip under the plot adds a region (pointer; the fields and the cursors are the keyboard way). */
async function brushScenario(page, check) {
  const box = await page.locator("#chart svg").boundingBox();
  const k = box.width / 800;
  const y = box.y + 328 * (box.height / 360);
  const at = (x) => box.x + x * k;
  const viewBefore = await page.textContent("#range");
  await page.mouse.move(at(200), y);
  await page.mouse.down();
  await page.mouse.move(at(420), y, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector(".range-list li", { timeout: 5000 });
  const [a, b] = await page.locator(".range-list input").evaluateAll((n) => n.map((x) => Number(x.value.replace(/\D/g, ""))));
  check("ranges: dragging under the x axis adds a region with whole numbers", b - a > 300 && a >= 650 && b <= 3800, `${a}-${b}`);
  check("ranges: the drag did not zoom", (await page.textContent("#range")) === viewBefore);
  await page.click('[data-fk="range-clear"]');
}

/** Memory only, English, dark theme and axe. */
async function stateScenario(page, check, axe) {
  await addByKeyboard(page, 650, 1800);
  await page.waitForSelector(".ranges-table tbody tr");
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), idb: (await indexedDB.databases()).map((d) => d.name).join() }));
  check("ranges: the choice is not stored", !/range|1800|650/.test(stored.local + stored.session) && !/range/.test(stored.idb), JSON.stringify(stored));
  const v1 = await axe(page);
  check("ranges: axe is clean with a region and its table (light, it)", v1.length === 0, v1.join(", "));
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  const v2 = await axe(page);
  check("ranges: axe is clean in dark", v2.length === 0, v2.join(", "));
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  check("ranges: English table and band words", /Whole/.test((await page.textContent(".ranges-table thead")) ?? "") && /Region 1/.test((await page.textContent("#chart")) ?? ""));
  const v3 = await axe(page);
  check("ranges: axe is clean in English", v3.length === 0, v3.join(", "));
}

/** @param {import("playwright").Browser} browser */
export async function rangesScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await setup(browser, base);
  await fieldsScenario(page, check);
  await errorsScenario(page, check);
  await brushScenario(page, check);
  await stateScenario(page, check, axe);
  check("ranges: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  const phone = await setup(browser, base, "it-IT", { width: 320, height: 640 });
  await phone.page.focus("body");
  await phone.page.keyboard.press("g");
  await addByKeyboard(phone.page, 650, 1800);
  await phone.page.waitForSelector(".ranges-table tbody tr", { timeout: 20000 });
  check("ranges: 320 px has no horizontal scroll with the picker and the table", await phone.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const v = await axe(phone.page);
  check("ranges: axe is clean at 320 px", v.length === 0, v.join(", "));
  await phone.ctx.close();
}
