// One vocabulary for the result: the engine's tier (T4) beside the word with no "level N" next to it, no ambiguity or different-form alert
// for an unknown sample, the chip says when a mixture is proposed (60/40 and lactose/levamisole 80/20), and "share of the signal" instead of "contribution".
import { jcamp } from "../confronto.mjs";

const ACTIVE = [[1700, 1.0, 10], [1450, 0.6, 12], [1250, 0.8, 10], [1050, 0.7, 12], [2950, 0.5, 25]];
const CAFFEINE = [[1700, 0.9, 10], [1655, 1.0, 10], [1550, 0.5, 10], [1240, 0.6, 12], [745, 0.6, 10]];
const PARACETAMOL = [[3325, 0.6, 30], [1610, 0.7, 10], [1505, 1.0, 10], [1225, 0.6, 10], [835, 0.5, 10]];
const LACTOSE = [[3350, 0.4, 80], [1160, 0.7, 15], [1070, 0.8, 15], [1030, 1.0, 12], [900, 0.3, 10]];
const LEVAMISOLE = [[1600, 0.9, 10], [1480, 0.7, 10], [1300, 0.6, 10], [700, 1.0, 10]];
const UNKNOWN = [[1735, 1.0, 10], [1380, 0.8, 12], [1120, 0.6, 10], [960, 0.7, 10], [790, 0.5, 10], [3060, 0.4, 16]];
const LIBRARY = { "example-a": ACTIVE, caffeine: CAFFEINE, paracetamol: PARACETAMOL, lactose: LACTOSE, levamisole: LEVAMISOLE };

const mix = (...parts) => parts.flatMap(([bands, k]) => bands.map(([c, h, w]) => [c, h * k, w]));

/** A JCAMP file with a little noise from a fixed seed (a measured spectrum is never noiseless). */
function noisy(name, bands) {
  let seed = 2650;
  const uniform = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lines = jcamp(name, bands).toString("latin1").split("\n").map((line) => (/^\d+, [\d.]+$/.test(line) ? line.replace(/, ([\d.]+)$/, (_, y) => `, ${(Number(y) + (uniform() - 0.5) * 0.004).toFixed(6)}`) : line));
  return Buffer.from(lines.join("\n"));
}

async function openPanel(page, name) {
  if (await page.evaluate(() => matchMedia("(max-width: 45em)").matches)) return page.click(`#tabbar [data-goto="${name}"]`);
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** The library above as the only one in use. */
async function importLibrary(page) {
  for (const name of [/swgdrug-ir/, /checkir-community/]) {
    await openPanel(page, "libraries");
    const box = page.getByRole("checkbox", { name });
    if (await box.isChecked()) await box.click();
  }
  await openPanel(page, "libraries");
  await page.fill("#lib-name", "Cancello");
  const files = Object.entries(LIBRARY).map(([name, bands]) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) }));
  await page.setInputFiles('input[data-library="files"]', files);
  await page.waitForFunction(() => /5/.test(document.querySelector('[data-library="cancello"]')?.textContent ?? ""));
}

async function start(browser, base, width, name, bands, locale = "it-IT") {
  const ctx = await browser.newContext({ locale, viewport: { width, height: width < 400 ? 640 : 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await importLibrary(page);
  await page.setInputFiles("input[type=file]", [{ name, mimeType: "chemical/x-jcamp-dx", buffer: noisy(name, bands) }]);
  if (await page.evaluate(() => document.body.dataset.section !== undefined)) await page.click(".panel-back");
  await page.waitForSelector(".result:not(.result-residual) .cand", { timeout: 20000 });
  return { ctx, page, errors };
}


export default async function resultVocabularyScenario({ browser, base, check }) {
  const mixed = await start(browser, base, 1366, "esempio_60_40.jdx", mix([ACTIVE, 0.6], [CAFFEINE, 0.4]));
  await mixed.page.waitForSelector("[data-mixture]", { timeout: 40000 });
  const block = (await mixed.page.textContent(".result:not(.result-residual)")) ?? "";
  check("vocabulary: no «livello N» anywhere in the result", !/livello\s*\d/i.test(block), block.slice(0, 200));
  const button = (await mixed.page.textContent('[data-fk="mixture-accept"]')) ?? "";
  check("vocabulary: the accept button has no level number", /Accetta la miscela/.test(button) && !/\d/.test(button), button);
  check("vocabulary: «quota del segnale», not «contributo»", /quota del segnale/.test(block) && !/contributo/i.test(block), block);
  await mixed.ctx.close();

  const it = await start(browser, base, 1366, "lattosio_80_20.jdx", mix([LACTOSE, 0.8], [LEVAMISOLE, 0.2]));
  await it.page.waitForSelector("[data-mixture-chip]", { timeout: 40000 });
  const chip = ((await it.page.textContent("[data-mixture-chip]")) ?? "").trim();
  check("vocabulary: lactose/levamisole 80/20, the chip names the proposed mixture", /^Miscela proposta: (lactose \+ levamisole|levamisole \+ lactose)$/i.test(chip), chip);
  await it.ctx.close();

  const en = await start(browser, base, 1366, "lactose_80_20.jdx", mix([LACTOSE, 0.8], [LEVAMISOLE, 0.2]), "en-US");
  await en.page.waitForSelector("[data-mixture-chip]", { timeout: 40000 });
  check("vocabulary: the chip in English", /^Proposed mixture: /.test(((await en.page.textContent("[data-mixture-chip]")) ?? "").trim()));
  check("vocabulary: «share of the signal» in English", /share of the signal/.test((await en.page.textContent("[data-mixture]")) ?? ""));
  await en.ctx.close();

  const unknown = await start(browser, base, 1366, "ignoto.jdx", UNKNOWN);
  const level = (await unknown.page.textContent(".result:not(.result-residual) .level-line")) ?? "";
  const ids = await unknown.page.$$eval(".result:not(.result-residual) [data-alert]", (n) => n.map((x) => x.getAttribute("data-alert")));
  check("vocabulary: an unknown sample shows T4 · Non identificato", /T4 · Non identificato/.test(level), level);
  check("vocabulary: an unknown sample has no ambiguity, twin or different-form alert", !ids.some((i) => ["ambiguity", "spectral_twin", "different_form"].includes(i)), ids.join(","));
  await unknown.ctx.close();
}
