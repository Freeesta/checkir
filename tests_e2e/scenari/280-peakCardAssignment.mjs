// Scenario run by fumo.mjs: the demo caffeine spectrum, its peak near 1212 cm-1 reads first from the caffeine bands, and the counts share one base.
import { readFile } from "node:fs/promises";

export default async ({ browser, base, check }) => {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const buffer = await readFile(new URL("../../data/demo/demo-09.jdx", import.meta.url));
  await page.setInputFiles("input[type=file]", { name: "demo-09.jdx", mimeType: "application/octet-stream", buffer });
  const results = page.locator('details[data-panel="results"]');
  if (!(await results.evaluate((d) => d.open))) await results.locator("summary").click();
  await page.waitForSelector(".result[data-level]", { timeout: 30000 });
  await page.keyboard.press("p");
  await page.waitForSelector("#peaks-summary:not([hidden])");
  const summary = (await page.textContent("#peaks-summary")) ?? "";
  const n = (re) => Number(re.exec(summary)?.[1] ?? NaN);
  const main = n(/principali:\s*(\d+)/);
  const explained = n(/spiegati da [^:]*:\s*(\d+)/);
  check("peak counts: explained never exceed the main peaks", explained <= main, summary);
  const panel = page.locator('details[data-panel="peaks"]');
  if (!(await panel.evaluate((d) => d.open))) await panel.locator("summary").click();
  const peaks = page.locator(".peak-item[data-state='explained']");
  const labels = await peaks.evaluateAll((b) => b.map((x) => [x.dataset.peak, x.textContent]));
  const near = labels.find(([, t]) => /12(0\d|1\d|2\d)/.test(t ?? ""));
  if (near) {
    await page.click(`.peak-item[data-peak="${near[0]}"]`);
    await page.waitForSelector(".reading");
    const first = (await page.locator(".reading strong").first().textContent()) ?? "";
    check("peak card: the first reading of a peak near 1212 is not the generic aryl ether", !/Etere arilico/i.test(first), first);
    const card = (await page.locator(".reading").first().textContent()) ?? "";
    check("peak card: the first reading names the substance and has its own text and source", /Assegnazione della banda di .*[Cc]affe/.test(card) && /stiramento C–N/.test(card) && !/non c'è ancora un testo/.test(card) && /fonti/.test(card), card);
  } else check("peak card: caffeine explains a peak near 1212", false, JSON.stringify(labels));
  check("peak card: no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
};
