// Clean-up e2e: one visible button per action (E1), the instrument block in one line behind an info button (E3), the panel that
// follows the step (E5) and the spectrum quality in the file chip, with a shape and a word.
import { BETA, jcamp } from "./confronto.mjs";
import { duplicatedActions } from "./registri.mjs";

const SECTIONS = ["files", "libraries", "results", "peaks", "sheet"];

/** Load a file and wait for its own result: the chip shows its code first, so a result left over from the previous file is not taken for the new one. */
async function loadAndWait(page, name, code) {
  await page.setInputFiles("input[type=file]", [{ name, mimeType: "application/octet-stream", buffer: jcamp(name, BETA) }]);
  await page.waitForFunction((c) => document.querySelector('[data-chip="file"]')?.textContent?.trim().startsWith(c), code);
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
}

async function openSections(page) {
  return page.evaluate(() => [...document.querySelectorAll("details[data-panel][open]")].map((d) => d.getAttribute("data-panel")));
}

/** E1 and E3: no action twice on the page in any section, and the instrument block is short. */
async function oneButtonScenario(page, check, axe) {
  check("clean: with nothing loaded no action is shown twice", (await duplicatedActions(page)).length === 0, (await duplicatedActions(page)).join(","));
  const bad = [];
  for (const id of SECTIONS) {
    await page.locator(`details[data-panel="${id}"] summary`).click();
    bad.push(...(await duplicatedActions(page)).map((a) => `${id}:${a}`));
  }
  check("clean: with a result no action is shown twice in any section (Open is only in the work bar)", bad.length === 0, bad.join(","));
  await page.locator('details[data-panel="files"] summary').click();
  const block = await page.evaluate(() => {
    const f = document.querySelector(".folder");
    const lines = [...(f?.querySelectorAll("p") ?? [])].map((p) => p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight));
    return { height: f?.getBoundingClientRect().height ?? 0, lines, info: f?.querySelectorAll("[aria-label^='Spiega']").length ?? 0 };
  });
  check("clean: the instrument block is one short row with an info button, no paragraph", block.lines.length === 0 && block.info === 1 && block.height < 130, JSON.stringify(block));
  const v = await axe(page);
  check("clean: axe has no violations with the short instrument block", v.length === 0, v.join(", "));
}

/** E5: a result opens the candidates only from section 1 or none, never takes another one; the subtraction closes the decision. */
async function followScenario(page, check) {
  await page.locator('details[data-panel="libraries"] summary').click();
  await loadAndWait(page, "beta.jdx", "C2");
  check("follow: a result arriving leaves the libraries section open by hand as it is", (await openSections(page)).join() === "libraries", (await openSections(page)).join());
  await page.locator('details[data-panel="sheet"] summary').click();
  await loadAndWait(page, "beta2.jdx", "C3");
  await page.waitForTimeout(500);
  check("follow: a result does not take the panel away from the sheet", (await openSections(page)).join() === "sheet", (await openSections(page)).join());
  await page.keyboard.press("d");
  await page.waitForSelector("#subtract:not([hidden])");
  check("follow: opening the subtraction closes the decision and shows the candidates", (await openSections(page)).join() === "results", (await openSections(page)).join());
  await page.keyboard.press("Escape");
}

/** The quality of the spectrum in the file chip: saturation and weak signal, with a shape and a word; a good spectrum shows nothing. */
async function qualityScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", [{ name: "bene.jdx", mimeType: "application/octet-stream", buffer: jcamp("bene", BETA) }]);
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  check("quality: a good spectrum has nothing in the file chip", (await page.locator('[data-chip="file"] [data-chip-quality]').count()) === 0);
  await oneButtonScenario(page, check, axe);
  await followScenario(page, check);
  await page.setInputFiles("input[type=file]", [{ name: "saturo.jdx", mimeType: "application/octet-stream", buffer: jcamp("saturo", BETA.map(([c, h, w]) => [c, h * 4, w])) }]);
  await page.waitForSelector('[data-chip="file"] [data-chip-quality]', { timeout: 20000 });
  const chip = page.locator('[data-chip="file"]');
  check("quality: a saturated spectrum puts a shape and the word in the file chip", /Saturazione/.test((await chip.textContent()) ?? "") && (await chip.locator(".chip-extra svg").count()) === 1 && /qualità dello spettro: .*Saturazione/.test((await chip.getAttribute("aria-label")) ?? ""));
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const v = await axe(page);
    check(`quality: axe has no violations with the quality mark (${scheme})`, v.length === 0, v.join(", "));
  }
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  check("quality: the word follows the language", /Saturation/.test((await chip.textContent()) ?? ""));
  await ctx.close();
}

/** A file opened before the library has arrived still gets its comparison (the worker must serve the `run` after the `sync`, not before). */
async function lateLibraryScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.route("**/librerie/**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", [{ name: "presto.jdx", mimeType: "application/octet-stream", buffer: jcamp("presto", BETA) }]);
  const arrived = await page.waitForSelector(".result[data-level]", { timeout: 20000 }).then(() => true, () => false);
  check("late library: a file opened before the library arrives still gets its result, with no error", arrived && (await page.locator("#candidates .error").count()) === 0);
  await ctx.close();
}

/** @param {import("playwright").Browser} browser */
export async function cleanScenario(browser, base, check, axe) {
  await qualityScenario(browser, base, check, axe);
  await lateLibraryScenario(browser, base, check);
}
