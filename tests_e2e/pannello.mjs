// Candidates e2e: score 0-100 and the margin once, no repeated spectra after importing the same folder twice, the library named
// after the folder, section 2 left open when a result arrives, no sheet button for an imported spectrum.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";

/** A folder "Miscela" with three different spectra and a copy of the first under another name. */
function folder() {
  const dir = join(mkdtempSync(join(tmpdir(), "checkir-")), "Miscela");
  mkdirSync(dir);
  for (const [name, bands] of [["alfa", ALFA], ["alfa_copia", ALFA], ["beta", BETA], ["gamma", GAMMA]]) writeFileSync(join(dir, `${name}.jdx`), jcamp(name === "alfa_copia" ? "alfa" : name, bands));
  return dir;
}

/** @param {import("playwright").Browser} browser */
export async function pannelloScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  const dir = folder();
  await page.setInputFiles('input[data-library="folder"]', dir);
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="miscela"]')?.textContent ?? ""));
  const libs = await page.locator(".lib-item.lib-item, [data-library].lib-item").evaluateAll((l) => l.map((x) => x.getAttribute("data-library")));
  check("pannello: the library takes the name of the folder, not a fixed one", libs.includes("miscela") && !libs.some((x) => /my-library|mia-libreria/.test(x)), libs.join());
  check("pannello: a file that repeats another is left out of the import (3 spectra of 4 files)", /Spettri: 3/.test((await page.textContent('[data-library="miscela"]')) ?? ""));
  await page.setInputFiles('input[data-library="folder"]', dir);
  await page.locator('[data-library="miscela-2"]').waitFor();
  await page.waitForFunction(() => !document.querySelector(".lib-progress") && /miscela-2» importata/.test(document.querySelector('details[data-panel="libraries"] .notes')?.textContent ?? ""));

  // Section 2 is open by hand and stays so, with the same nodes, when the result arrives.
  await page.evaluate(() => (document.querySelector("#lib-name").__keep = 1));
  await page.setInputFiles("input[type=file]:not([data-library])", [{ name: "campione_beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) }]);
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const open = await page.evaluate(() => ({ libs: document.querySelector('details[data-panel="libraries"]').open, results: document.querySelector('details[data-panel="results"]').open, keep: document.querySelector("#lib-name")?.__keep === 1 }));
  check("pannello: section 2 opened by hand stays open and is not rebuilt when a result arrives", open.libs && !open.results && open.keep, JSON.stringify(open));

  const rows = await page.locator("#main-content .cand").evaluateAll((l) => l.map((x) => ({ name: x.querySelector(".cand-name").childNodes[0].textContent.trim(), r: x.querySelector(".cand-r").textContent.trim(), margin: x.querySelector(".cand-delta").textContent.trim(), lib: x.querySelector(".cand-lib").textContent.trim() })));
  const text = JSON.stringify(rows);
  check("pannello: the score is a whole number from 0 to 100", rows.length >= 3 && rows.every((x) => /^\d{1,3}$/.test(x.r) && Number(x.r) <= 100), text);
  check("pannello: the margin is on the first row only, as «margine N»", /^margine \d{1,3}$/.test(rows[0].margin) && rows.slice(1).every((x) => x.margin === ""), text);
  check("pannello: no spectrum appears twice (the folder imported twice, a copy inside)", new Set(rows.map((x) => x.name.toLowerCase())).size === rows.length, text);
  check("pannello: the column is «Match» and the library column shows the folder name", /Match/.test((await page.textContent(".cand-head")) ?? "") && /^miscela/.test(rows[0].lib), text);
  const chain = (await page.textContent(".result .chain")) ?? "";
  check("pannello: the libraries read «name (N spettri)»", /miscela \(3 spettri\)/.test(chain) && !/miscela 1/.test(chain), chain);
  check("pannello: no sheet button for an imported spectrum", (await page.locator('[data-fk="open-sheet"]').count()) === 0);
  check("pannello: no script errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
