// Rename e2e: a private library gets another name (button or double click), kept after a reload, shown in the results, Esc keeps the old one.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALFA, BETA, jcamp } from "./confronto.mjs";

function folder() {
  const dir = join(mkdtempSync(join(tmpdir(), "checkir-")), "Miscela");
  mkdirSync(dir);
  for (const [name, bands] of [["alfa", ALFA], ["beta", BETA]]) writeFileSync(join(dir, `${name}.jdx`), jcamp(name, bands));
  return dir;
}

/** @param {import("playwright").Browser} browser */
export async function rinominaScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.setInputFiles('input[data-library="folder"]', folder());
  await page.waitForFunction(() => /2/.test(document.querySelector('[data-library="miscela"]')?.textContent ?? ""));
  check("rename: only a private library has the button", (await page.locator('[data-fk="lib-rename-miscela"]').count()) === 1 && (await page.locator('[data-fk^="lib-rename-checkir"]').count()) === 0);

  await page.click('[data-fk="lib-rename-miscela"]');
  await page.fill('[data-fk="lib-name-miscela"]', "Esc");
  await page.keyboard.press("Escape");
  check("rename: Esc keeps the old name", ((await page.textContent('[data-library="miscela"] strong')) ?? "").trim() === "miscela" && (await page.locator(".lib-rename").count()) === 0);

  await page.click('[data-fk="lib-rename-miscela"]');
  await page.fill('[data-fk="lib-name-miscela"]', "  Mia miscela ");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-library="miscela"] strong')?.textContent === "Mia miscela");
  check("rename: Enter saves the name and the id does not change", (await page.locator('[data-library="miscela"]').count()) === 1);

  await page.setInputFiles("input[type=file]:not([data-library])", [{ name: "campione_beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) }]);
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const lib = ((await page.textContent("#main-content .cand .cand-lib")) ?? "").trim();
  const chain = (await page.textContent(".result .chain")) ?? "";
  check("rename: results show the new name", lib === "Mia miscela" && /Mia miscela \(2 spettri\)/.test(chain), `${lib} | ${chain}`);

  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.locator('[data-library="miscela"]').waitFor();
  check("rename: the name is still there after a reload", ((await page.textContent('[data-library="miscela"] strong')) ?? "") === "Mia miscela");

  await page.dblclick('[data-library="miscela"] strong');
  await page.fill('[data-fk="lib-name-miscela"]', "");
  await page.locator('[data-fk="lib-name-miscela"]').blur();
  await page.waitForFunction(() => document.querySelector('[data-library="miscela"] strong')?.textContent === "miscela");
  check("rename: double click opens the field and an empty name goes back to the id", ((await page.textContent('[data-library="miscela"] strong')) ?? "") === "miscela");
  check("rename: no script errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
