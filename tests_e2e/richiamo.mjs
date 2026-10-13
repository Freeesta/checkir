// Recalled compounds e2e: search by name, up to three references, overlaid / offset / difference, the four scales, the numbers beside each one, "keep as residual".
import { BETA, GAMMA, ALFA, ALFA_BIS, jcamp } from "./confronto.mjs";
import { pearson, scaleFactor, valueAt } from "../web/recall_math.js";

/** Pure arithmetic: the four scales, interpolation, correlation. */
function pureScenario(check) {
  const ref = { wavenumber_cm1: [400, 402, 404, 406], y: [0, 1, 2, 3] };
  check("recall: library value is interpolated and NaN outside", valueAt(ref, 403) === 1.5 && Number.isNaN(valueAt(ref, 399)));
  const p = { x: [1, 2, 3], s: [2, 4, 6], r: [1, 2, 3] };
  check("recall: scales to the maximum, the area and least squares agree on a pure multiple", scaleFactor("max", p) === 2 && scaleFactor("area", p) === 2 && Math.abs(scaleFactor("lsq", p) - 2) < 1e-12 && scaleFactor("raw", p) === 1);
  check("recall: correlation of a line with itself is 1 and a flat curve has none", Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12 && pearson([1, 1, 1, 1], [1, 2, 3, 4]) === null);
}

export async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

export async function prepare(browser, base) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  const file = (name, bands) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) });
  await page.setInputFiles('input[data-library="files"]', [file("alfa", ALFA), file("beta", BETA), file("gamma", GAMMA), file("alfa_bis", ALFA_BIS)]);
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]", [{ name: "campione.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("campione", BETA) }]);
  await openPanel(page, "results");
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  return { ctx, page };
}

/** Type in the search dialog and click the n-th hit. */
export async function pick(page, text, n = 0) {
  await page.fill("#recall-q", text);
  await page.locator(".recall-results button").nth(n).click();
}

export async function recallScenario(browser, base, check, axe) {
  pureScenario(check);
  const { ctx, page } = await prepare(browser, base);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  await page.waitForSelector("dialog #recall-q");
  check("recall: n opens the search", await page.isVisible("dialog #recall-q"));
  await pick(page, "bet");
  await page.waitForSelector("#recall:not([hidden]) .recall-item");
  const text = (await page.textContent("#recall")) ?? "";
  check("recall: the first hit is in the comparison at position 1 with its numbers", /Posizione nel confronto: 1º/.test(text) && /r spettro \d\.\d\d · r derivata/.test(text), text);
  check("recall: no level is shown beside a compound picked by hand", !/Livello|Probabile|Da verificare/.test(text));
  await pick(page, "gam");
  await pick(page, "alf");
  check("recall: three references are drawn, each with a dash and a label", (await page.locator("#chart polyline.curve-recalled").count()) === 3 && (await page.locator("#chart .extra-label").count()) === 3);
  await pick(page, "alf", 1);
  check("recall: a fourth reference is refused", (await page.locator(".recall-item").count()) === 3 && await page.waitForFunction(() => /già 3 riferimenti/.test(document.getElementById("status")?.textContent ?? "")).then(() => true));
  await page.keyboard.press("Escape");
  const heads = await page.locator("#table thead th").allTextContents();
  check("recall: the table has one column per reference", ["alfa", "beta", "gamma"].every((n) => heads.includes(n)) && !heads.some((h) => /imported/.test(h)), heads.join("|"));
  const overlay = await page.getAttribute("#chart polyline.curve-recalled >> nth=0", "points");
  await page.check("#recall-mode-offset");
  await page.waitForSelector("#recall-offset");
  check("recall: offset moves the curves down", (await page.getAttribute("#chart polyline.curve-recalled >> nth=0", "points")) !== overlay);
  const before = await page.textContent(".recall-numbers >> nth=1");
  await page.selectOption("#recall-scale", "lsq");
  check("recall: the scale changes the factor", (await page.textContent(".recall-numbers >> nth=1")) !== before);
  await page.check("#recall-mode-difference");
  await page.waitForSelector("#chart polyline.curve-difference");
  check("recall: difference shows the residual and hides the references", (await page.locator("#chart polyline.curve-recalled").count()) === 0 && /Differenza: campione/.test((await page.textContent(".recall-diff")) ?? ""));
  await page.click("[data-fk=recall-keep]");
  await openPanel(page, "files");
  await page.waitForFunction(() => document.body.textContent?.includes("C1-r1"));
  check("recall: keep as residual puts C1-r1 in the tree", true);
  await page.setViewportSize({ width: 320, height: 700 });
  check("recall: 320 px, no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 1366, height: 900 });
  check("recall: reduced motion needs no animation", (await page.evaluate(() => document.getAnimations().length)) === 0);
  await page.locator("#recall").evaluate((e) => e.scrollIntoView({ block: "center" }));
  const violations = await axe(page);
  check("recall: axe has no violations", violations.length === 0, violations.join(", "));
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => /Recalled compounds/.test(document.getElementById("recall")?.textContent ?? ""));
  check("recall: English labels", true);
  await ctx.close();
}
