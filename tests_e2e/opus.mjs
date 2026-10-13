// OPUS e2e: a synthetic Bruker OPUS file (absorbance and single-channel variants) is loaded in the page, the spectrum is drawn
// with its table and the comparison starts by itself against a synthetic library built from the same bands.
import { readFile } from "node:fs/promises";
import { jcamp } from "./confronto.mjs";

const DIR = new URL("../crates/ftir-core/tests/fixtures/opus/", import.meta.url);
/** Bands of `Params::demo()` in the engine: [centre, height, half-width]. */
const DEMO = [[2920, 0.8, 25], [1715, 1.0, 12], [1450, 0.4, 15], [1100, 0.6, 30], [700, 0.3, 10]];
const OTHER = [[900, 0.7, 10], [1050, 0.5, 12], [1550, 0.9, 12], [1800, 0.6, 12], [3400, 0.6, 25]];

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

export async function opusScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Opus");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "demo.jdx", mimeType: "application/octet-stream", buffer: jcamp("demo", DEMO) },
    { name: "altro.jdx", mimeType: "application/octet-stream", buffer: jcamp("altro", OTHER) },
  ]);
  await page.locator('[data-library="opus"]').waitFor();
  await page.waitForFunction(() => /2/.test(document.querySelector('[data-library="opus"]')?.textContent ?? ""));

  const bytes = await readFile(new URL("absorbance.0", DIR));
  await page.setInputFiles("input[type=file]", { name: "campione.0", mimeType: "application/octet-stream", buffer: bytes });
  await page.waitForSelector("#chart polyline.curve");
  const rows = await page.locator("#table tbody tr").count();
  check("opus: chart and table show the points of the file", rows > 100, String(rows));
  const chip = (await page.textContent('[data-chip="file"]'))?.trim() ?? "";
  check("opus: the header says C1 with the range", chip.startsWith("C1") && chip.includes("4000–400"), chip);
  await openPanel(page, "results");
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const first = (await page.locator(".cand .cand-name").first().textContent()) ?? "";
  check("opus: the comparison starts by itself and the first candidate is demo", /demo/i.test(first), first);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  check("opus: sample name, operator and path of the file never reach the page", !/Case 4711|Giulia Neri|gneri|SN-1234567/.test(html));

  const single = await readFile(new URL("single_channel.0", DIR));
  await page.setInputFiles("input[type=file]", { name: "canale_singolo.0", mimeType: "application/octet-stream", buffer: single });
  await page.waitForSelector('[data-fk="sel-C2"]', { state: "attached" });
  await page.waitForSelector("#chart polyline.curve");
  check("opus: a file with only single-channel spectra is drawn as absorbance", (await page.locator("#table tbody tr").count()) > 100);

  await page.setInputFiles("input[type=file]", { name: "rotto.0", mimeType: "application/octet-stream", buffer: bytes.subarray(0, 300) });
  await page.waitForSelector("#panel .error");
  const err = (await page.textContent("#panel .error")) ?? "";
  check("opus: a truncated file shows a translated message, never a raw key", err.length > 0 && !err.includes("reader."), err);
  const bad = await axe(page);
  check("opus: axe is clean with the file and the error shown", bad.length === 0, bad.join(", "));
  check("opus: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
