// DEMO spectra (data/demo/): the real, cleaned measurements open in the viewer like any file; the page stays clean while they do.
import { readFile } from "node:fs/promises";

const DEMOS = ["demo-01", "demo-12"];

/** @param {import("playwright").Browser} browser @param {string} base */
export async function demoScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  for (const id of DEMOS) {
    const buffer = await readFile(new URL(`../data/demo/${id}.jdx`, import.meta.url));
    await page.setInputFiles("input[type=file]", { name: `${id}.jdx`, mimeType: "application/octet-stream", buffer });
    await page.waitForSelector("#chart polyline.curve");
    const rows = await page.locator("#table tbody tr").count();
    check(`demo: ${id} opens and its table lists the (thinned) points`, rows > 100, String(rows));
  }
  const violations = await axe(page);
  check("demo: axe finds nothing with a real spectrum loaded", violations.length === 0, JSON.stringify(violations));
  check("demo: no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}
