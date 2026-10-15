// Scenario run by fumo.mjs: with the default libraries no synthetic example is a candidate, and a folder with the same
// spectra as the public ones adds no repeated candidate, no twin/ambiguity alert between copies and no raw id.
import { readFile } from "node:fs/promises";
import { chipCount } from "../conteggio.mjs";
import { importAs } from "../importa_aiuto.mjs";

const SYNTHETIC = new URL("../../data/substances/synthetic-a/spectra/synthetic-a-base.checkir.001.jdx", import.meta.url);
const CAFFEINE = new URL("../../data/substances/caffeine/spectra/caffeine-base.swgdrug.357.jdx", import.meta.url);

async function openResults(page) {
  const section = page.locator('details[data-panel="results"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  await page.waitForSelector(".result[data-level]", { timeout: 30000 });
}

export default async ({ browser, base, check }) => {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.locator('[data-library="swgdrug-ir"]').waitFor();
  const demo = page.getByRole("checkbox", { name: /checkir-demo/ });
  check("no synthetic: the demo library is listed but off by default", (await demo.count()) === 1 && !(await demo.isChecked()));
  check("no synthetic: the header counts only the real library", ((await page.textContent('[data-chip="library"]')) ?? "").includes(await chipCount(base)));

  await page.setInputFiles("input[type=file]", { name: "campione.jdx", mimeType: "chemical/x-jcamp-dx", buffer: await readFile(SYNTHETIC) });
  await openResults(page);
  const text = (await page.locator('details[data-panel="results"]').textContent()) ?? "";
  check("no synthetic: the synthetic example is not among the candidates", !/sintetic|synthetic/i.test(text), text.slice(0, 300));

  // The same caffeine as the public library, imported as a private one under another name.
  const caffeine = await readFile(CAFFEINE);
  await page.locator('details[data-panel="libraries"] summary').click();
  await importAs(page, "Copia", [{ name: "caffeine-base_lab.jdx", mimeType: "application/octet-stream", buffer: caffeine }]);
  await page.waitForFunction(() => document.querySelector('[data-library="copia"]'), null, { timeout: 30000 });
  await page.setInputFiles("input[type=file]", { name: "caffeina.jdx", mimeType: "chemical/x-jcamp-dx", buffer: caffeine });
  await page.waitForFunction(() => /caffe/i.test([...document.querySelectorAll(".cands > li")].map((e) => e.textContent).join(" ")), null, { timeout: 30000 });
  await openResults(page);
  await page.waitForTimeout(3000); // the twin search runs after the first result
  const res = page.locator("body");
  const body = (await res.textContent()) ?? "";
  const rows = await res.locator(".cands > li").count();
  const caffeineRows = await res.locator(".cands > li", { hasText: /caffe/i }).count();
  check("no synthetic: identical spectra of two libraries are one candidate", caffeineRows === 1, `${caffeineRows} of ${rows}`);
  check("no synthetic: no twin or ambiguity alert between copies of the same spectrum", (await res.locator('[data-alert="ambiguity"], [data-alert="spectral_twin"]').count()) === 0, body.slice(0, 400));
  check("no synthetic: no raw spectrum id in the results", !/caffeine-base[._]/i.test(body) && !body.includes("_lab"), body.slice(0, 400));
  check("no synthetic: no page error", errors.length === 0, errors.join("; "));
  await ctx.close();

  // First result after the page opens: it is computed with all the default libraries, never shown first with a part of them.
  const ctx2 = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    /** @type {string[]} */
    const seen = (window.__levels = []);
    new MutationObserver(() => {
      const v = document.querySelector(".result[data-level]")?.getAttribute("data-level");
      if (v && seen[seen.length - 1] !== v) seen.push(v);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-level"] });
  });
  await page2.goto(base);
  await page2.setInputFiles("input[type=file]", { name: "caffeina.jdx", mimeType: "chemical/x-jcamp-dx", buffer: caffeine });
  await page2.waitForSelector(".result[data-level]", { timeout: 30000 });
  await page2.waitForTimeout(4000);
  const levels = await page2.evaluate(() => window.__levels);
  check("no synthetic: the first result of a known spectrum is never a provisional level 4", levels.length >= 1 && !levels.includes("4") && new Set(levels).size === 1, levels.join(">"));
  await ctx2.close();
};
