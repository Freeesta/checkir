// Binary formats e2e: a synthetic Thermo OMNIC .spa and a Galactic .spc are loaded from the chooser and show their spectrum
// (chart and table); an SPC in the old format gives a translated error, never a raw key.
import { readFile } from "node:fs/promises";

const fixture = (dir, name) => readFile(new URL(`../crates/ftir-core/tests/fixtures/${dir}/${name}`, import.meta.url));

async function loadsAndShows(page, check, file, buffer, label) {
  await page.setInputFiles("input[type=file]", { name: file, mimeType: "application/octet-stream", buffer });
  await page.waitForFunction((n) => document.querySelector('[data-chip="file"]')?.textContent?.includes(n) || document.querySelector("#chart polyline.curve"), file);
  await page.waitForSelector("#chart polyline.curve");
  const rows = await page.locator("#table tbody tr").count();
  check(`${label}: chart and table show the 181 points of the file`, rows === 181, String(rows));
  const chip = (await page.textContent('[data-chip="file"]'))?.trim() ?? "";
  check(`${label}: the header shows the range`, chip.includes("4000–400"), chip);
}

export async function binariesScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await loadsAndShows(page, check, "campione.spa", await fixture("spa", "absorbance.spa"), "spa");
  await page.click("#lang-button");
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await loadsAndShows(page, check, "campione.spc", await fixture("spc", "float32.spc"), "spc");
  const bad = await axe(page);
  check("binaries: axe is clean with a .spa and an .spc loaded", bad.length === 0, bad.join(", "));
  await page.setInputFiles("input[type=file]", { name: "vecchio.spc", mimeType: "application/octet-stream", buffer: await fixture("spc", "old_format.spc") });
  await page.waitForFunction(() => document.querySelector("#panel .error")?.textContent?.includes("old format"));
  const err = (await page.textContent("#panel .error")) ?? "";
  check("binaries: an SPC in the old format gives a translated error", err.includes("old format") && !err.includes("reader."), err);
  check("binaries: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
