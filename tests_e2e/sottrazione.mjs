// Guided subtraction e2e: a synthetic mixture A + 0.6·B, the factor proposed by the engine, the slider, the over-subtraction warning, the residual as a new
// spectrum under its sample, the search on it, undo, and that the original never changes.
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";

/** The mixture: A at full height plus B at 0.6. */
export const MIX = [...ALFA, ...BETA.map(([c, h, w]) => [c, h * 0.6, w])];

async function openPanel(page, name) {
  if (await page.evaluate(() => matchMedia("(max-width: 45em)").matches)) return page.click(`#tabbar [data-goto="${name}"]`);
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** Import the synthetic library (alfa, beta, gamma) as the only one in use. */
export async function importLibrary(page) {
  // With a sample already open, switching a public library off runs the match again and the results panel takes the place
  // of the libraries panel (one open section at a time): reopen it before each step.
  for (const name of [/swgdrug-ir/]) {
    await openPanel(page, "libraries");
    const box = page.getByRole("checkbox", { name });
    if (await box.isChecked()) await box.click();
  }
  await openPanel(page, "libraries");
  await page.fill("#lib-name", "Sintetica");
  const file = (name, bands) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) });
  await page.setInputFiles('input[data-library="files"]', [file("alfa", ALFA), file("beta", BETA), file("gamma", GAMMA)]);
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
}

/** The mixture as a JCAMP file with a little noise (fixed seed): a measured spectrum is never noiseless, and the over-subtraction limit is a multiple of the noise. */
function mixtureFile(name) {
  let seed = 12345;
  const noise = () => {
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      sum += seed / 2147483648 - 0.5;
    }
    return sum * 0.01;
  };
  const text = jcamp(name, MIX).toString("latin1").split("\n").map((line) => (/^\d+, [\d.]+$/.test(line) ? line.replace(/, ([\d.]+)$/, (_, y) => `, ${(Number(y) + noise()).toFixed(6)}`) : line));
  return Buffer.from(text.join("\n"));
}

/** Load the mixture under `name` and wait for its comparison; the first candidate named alfa is chosen. */
export async function loadMixture(page, name = "campione_miscela.jdx") {
  await page.setInputFiles("input[type=file]", [{ name, mimeType: "chemical/x-jcamp-dx", buffer: mixtureFile(name) }]);
  if (await page.evaluate(() => document.body.dataset.section !== undefined)) await page.click(".panel-back"); // on a phone the open section covers the candidates
  await page.waitForSelector(".result:not(.result-residual) .cand", { timeout: 20000 });
  await page.locator(".result:not(.result-residual) .cand", { hasText: /alfa/ }).first().locator(".cand-select").click();
}

/** For the privacy test: a library, a mixture carrying the canary file name, a subtraction and the search on its residual. */
export async function subtractionTrace(page, fileName) {
  await importLibrary(page);
  await loadMixture(page, fileName);
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden]) polyline.strip-residual");
  await page.click('#subtract [data-action="subtract.search"]');
  await page.waitForSelector(".result-residual .cand-name", { timeout: 20000 });
}

async function prepare(browser, base) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await importLibrary(page);
  await loadMixture(page);
  return { ctx, page, errors };
}

const factor = async (page) => Number(await page.inputValue("#factor-field"));
const residualCurve = (page) => page.getAttribute("#subtract polyline.strip-residual", "points");
const original = (page) => page.evaluate(async () => JSON.stringify((await import(new URL("files.js", location.href).href)).spectrumOf("C1")));

/** Open the subtraction with `d` on the chosen candidate: the factor is the proposed one, the three strips and their table are there. */
async function openScenario(page, check, axe) {
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden]) polyline.strip-residual");
  const k = await factor(page);
  check("subtract: d opens the view in place of the chart", (await page.isHidden("#chart-section")) && (await page.isVisible("#subtract")));
  check("subtract: the factor is the proposed one, two decimals with a point", /^\d\.\d\d$/.test(await page.inputValue("#factor-field")) && Math.abs(k - 1) < 0.2, String(k));
  check("subtract: three strips, the reference dashed", (await page.locator("#subtract svg polyline").count()) === 3 && (await page.locator("#subtract polyline.strip-reference").count()) === 1);
  const heads = await page.locator("#subtract table thead th").allTextContents();
  check("subtract: every strip is also a column of the table", heads.length === 4 && /Residuo/.test(heads[3]) && (await page.locator("#subtract table tbody tr").count()) > 100, heads.join(" | "));
  check("subtract: no fixed caution about the factor", !/non è la quantità/.test((await page.textContent("#subtract")) ?? ""));
  check("subtract: no over-subtraction warning at the proposed factor", ((await page.textContent(".subtract-warning")) ?? "").trim() === "");
  const v = await axe(page);
  check("subtract: axe has no violations", v.length === 0, v.join(", "));
}

/** The slider: ↑ 0.01, PageDown 0.10, the number field, the warning when the factor is too high, back to the proposed one. */
async function factorScenario(page, check) {
  const k0 = await factor(page);
  const before = await residualCurve(page);
  await page.focus("#factor-range");
  await page.keyboard.press("ArrowUp");
  const k1 = await factor(page);
  check("subtract: ArrowUp raises the factor by 0.01", Math.abs(k1 - k0 - 0.01) < 1e-9, `${k0} -> ${k1}`);
  check("subtract: the residual is drawn again", (await residualCurve(page)) !== before);
  await page.keyboard.press("PageDown");
  check("subtract: PageDown lowers the factor by 0.10", Math.abs((await factor(page)) - (k1 - 0.1)) < 1e-9);
  await page.keyboard.press("ArrowDown");
  check("subtract: the slider keeps the focus", (await page.evaluate(() => document.activeElement?.id)) === "factor-range");
  await page.fill("#factor-field", "1,90");
  await page.press("#factor-field", "Enter");
  check("subtract: the field takes a comma and shows a point", (await page.inputValue("#factor-field")) === "1.90");
  await page.waitForFunction(() => (document.querySelector(".subtract-warning")?.textContent ?? "").trim() !== "");
  check("subtract: a factor that is too high warns about over-subtraction", /sotto zero/.test((await page.textContent(".subtract-warning")) ?? ""));
  await page.click("#subtract [data-fk='factor-proposed']");
  check("subtract: the proposed value comes back and the warning goes", (await factor(page)) === k0 && ((await page.textContent(".subtract-warning")) ?? "").trim() === "");
}

/** The chart is shown and at least its upper half is inside the window. */
const chartInView = (page) => page.evaluate(() => { const r = document.querySelector("#chart")?.getBoundingClientRect(); return !!r && r.width > 0 && r.top >= 0 && r.top + r.height / 2 <= innerHeight; });

/** Search the residual: it is a new spectrum under C1, its candidates are below the sample's, B is the first one, the original is unchanged. */
async function searchScenario(page, check, axe, errors) {
  const before = await original(page);
  await page.click('#subtract [data-action="subtract.search"]');
  await page.waitForSelector(".result-residual[data-level] .cand-name", { timeout: 20000 });
  check("subtract: after the search the chart stays in view next to the new result", await chartInView(page));
  const name = (await page.locator(".result-residual .cand-name").first().textContent()) ?? "";
  check("subtract: the first candidate of the residual is beta", /beta/i.test(name), name);
  check("subtract: the sample's candidates are still there, above", (await page.locator(".result:not(.result-residual) .cand").count()) > 0 && (await page.evaluate(() => { const a = document.querySelector(".result:not(.result-residual)"); const b = document.querySelector(".result-residual"); return !!(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })));
  check("subtract: the residual has its level next to the names", await page.evaluate(() => [...document.querySelectorAll(".result-residual .cand-name")].every((n) => n.closest(".result")?.querySelector(".level"))));
  await openPanel(page, "files");
  const tree = (await page.textContent("details[data-panel='files'] .files")) ?? "";
  check("subtract: the tree shows C1-r1 under C1 with what was subtracted", /C1-r1/.test(tree) && /sottratto: alfa, sintetica, k = \d\.\d\d/i.test(tree) && (await page.locator("details[data-panel='files'] .files .files .file-select").count()) === 1, tree);
  check("subtract: the shown spectrum is still C1", /C1/.test((await page.textContent('[data-chip="file"]')) ?? "") && (await page.isVisible("#chart-section")));
  check("subtract: the original is identical", (await original(page)) === before);
  const v = await axe(page);
  check("subtract: axe has no violations with the residual", v.length === 0, v.join(", "));
  check("subtract: no page errors", errors.length === 0, errors.join(" | "));
}

/** The residual can be shown (its own results), subtracted again (C1-r2 under C1-r1), and `u` takes the last one away. */
async function chainScenario(page, check) {
  await openPanel(page, "results");
  await page.click('.result-residual [data-fk="show-C1-r1"]');
  await page.waitForFunction(() => document.querySelector("[data-chip='file']")?.textContent?.includes("C1-r1"));
  await page.waitForSelector(".result:not(.result-residual) .cand");
  await page.locator(".result:not(.result-residual) .cand").first().locator(".cand-select").click();
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden]) polyline.strip-residual");
  await page.click('#subtract [data-action="subtract.search"]');
  await page.waitForSelector(".result-residual[data-code='C1-r2']");
  await openPanel(page, "files");
  check("subtract: a residual of a residual is C1-r2 under C1-r1", (await page.locator("details[data-panel='files'] .files .files .files .file-select").count()) === 1);
  await page.keyboard.press("u");
  await page.waitForFunction(() => document.querySelectorAll("details[data-panel='files'] .file-select").length === 2);
  check("subtract: u takes away the last residual and keeps the other", (await page.locator("details[data-panel='files'] .file-select").count()) === 2);
  await page.keyboard.press("u");
  await page.waitForFunction(() => document.querySelectorAll("details[data-panel='files'] .file-select").length === 1);
  check("subtract: u again goes back to the sample alone", (await page.locator("details[data-panel='files'] .file-select").count()) === 1 && /C1/.test((await page.textContent('[data-chip="file"]')) ?? ""));
}

/** Close without a residual, English, phone width. */
async function closeScenario(page, check) {
  await openPanel(page, "results");
  await page.locator(".result:not(.result-residual) .cand").first().locator(".cand-select").click();
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden])");
  await page.click('#subtract [data-action="subtract.close"]');
  check("subtract: closing brings the chart back and makes no residual", (await page.isHidden("#subtract")) && (await page.isVisible("#chart-section")) && (await page.locator("details[data-panel='files'] .file-select").count()) === 1);
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden])");
  await page.click("#lang-button");
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en" && /Guided subtraction/.test(document.getElementById("subtract-title")?.textContent ?? "")); // the view is redrawn after the language attribute changes
  check("subtract: English names the view", /Guided subtraction/.test((await page.textContent("#subtract-title")) ?? "") && !/not the quantity/.test((await page.textContent("#subtract")) ?? ""));
  await page.click("#lang-button");
  await page.click('[data-lang="it"]');
  const stored = await page.evaluate(async () => ({ local: JSON.stringify({ ...localStorage }), idb: (await indexedDB.databases()).length }));
  check("subtract: nothing of it is stored", !/subtract|residu|"k"/i.test(stored.local) && Object.keys(JSON.parse(stored.local)).every((k) => /^checkir\.(lang|theme|panel|shortcuts|autoMatch)$/.test(k)));
}

async function phoneScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await importLibrary(page);
  await loadMixture(page);
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden]) polyline.strip-residual");
  check("subtract: 320 px leaves the section and shows the view", (await page.getAttribute("body", "data-section")) === null && (await page.isVisible("#subtract")));
  check("subtract: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const v = await axe(page);
  check("subtract: 320 px axe has no violations", v.length === 0, v.join(", "));
  await ctx.close();
}

export async function subtractionScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await prepare(browser, base);
  await openScenario(page, check, axe);
  await factorScenario(page, check);
  await searchScenario(page, check, axe, errors);
  await chainScenario(page, check);
  await closeScenario(page, check);
  await ctx.close();
  await phoneScenario(browser, base, check, axe);
}
