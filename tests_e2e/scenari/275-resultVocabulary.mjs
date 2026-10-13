// One vocabulary for the result: the engine's tier (T4) beside the word with no "level N" next to it, no ambiguity or different-form alert
// for an unknown sample, the chip says when a mixture is proposed, and "share of the signal" instead of "contribution".
import { ALFA, BETA, jcamp } from "../confronto.mjs";
import { importLibrary } from "../sottrazione.mjs";

const scale = (bands, k) => bands.map(([c, h, w]) => [c, h * k, w]);
const UNKNOWN = [[950, 0.8, 12], [1300, 0.7, 14], [1800, 0.6, 16], [2650, 0.5, 20]];

function noisy(name, bands) {
  let seed = 4321;
  const uniform = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lines = jcamp(name, bands).toString("latin1").split("\n").map((line) => (/^\d+, [\d.]+$/.test(line) ? line.replace(/, ([\d.]+)$/, (_, y) => `, ${(Number(y) + (uniform() - 0.5) * 0.02).toFixed(6)}`) : line));
  return Buffer.from(lines.join("\n"));
}

async function open(browser, base, name, bands, locale = "it-IT") {
  const ctx = await browser.newContext({ locale, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await importLibrary(page);
  await page.setInputFiles("input[type=file]", [{ name, mimeType: "chemical/x-jcamp-dx", buffer: noisy(name, bands) }]);
  if (await page.evaluate(() => document.body.dataset.section !== undefined)) await page.click(".panel-back");
  await page.waitForSelector(".result:not(.result-residual) .cand", { timeout: 20000 });
  return { ctx, page };
}

export default async function resultVocabularyScenario({ browser, base, check }) {
  const mix = await open(browser, base, "miscela_60_40.jdx", [...scale(BETA, 0.6), ...scale(ALFA, 0.4)]);
  await mix.page.waitForSelector("[data-mixture]", { timeout: 40000 });
  const block = (await mix.page.textContent(".result:not(.result-residual)")) ?? "";
  check("vocabulary: no «livello N» anywhere in the result", !/livello\s*\d/i.test(block), block.slice(0, 200));
  const button = (await mix.page.textContent('[data-fk="mixture-accept"]')) ?? "";
  check("vocabulary: the accept button has no level number", /Accetta la miscela/.test(button) && !/\d/.test(button), button);
  const chip = (await mix.page.textContent("[data-mixture-chip]")) ?? "";
  check("vocabulary: the chip names the proposed mixture", /^Miscela proposta: (alfa \+ beta|beta \+ alfa)$/i.test(chip.trim()), chip);
  check("vocabulary: «quota del segnale», not «contributo»", /quota del segnale/.test(block) && !/contributo/i.test(block), block);
  await mix.ctx.close();

  const second = await open(browser, base, "miscela_70_30.jdx", [...scale(BETA, 0.7), ...scale(ALFA, 0.3)], "en-US");
  await second.page.waitForSelector("[data-mixture-chip]", { timeout: 40000 });
  const en = (await second.page.textContent("[data-mixture-chip]")) ?? "";
  check("vocabulary: 70/30 mixture, chip in English", /^Proposed mixture: /.test(en.trim()), en);
  check("vocabulary: English wording", /share of the signal/.test((await second.page.textContent("[data-mixture]")) ?? ""));
  await second.ctx.close();

  const unknown = await open(browser, base, "ignoto.jdx", UNKNOWN);
  const level = (await unknown.page.textContent(".result:not(.result-residual) .level-line")) ?? "";
  const ids = await unknown.page.$$eval(".result:not(.result-residual) [data-alert]", (n) => n.map((x) => x.getAttribute("data-alert")));
  check("vocabulary: an unknown sample shows T4 · Non identificato", /T4 · Non identificato/.test(level), level);
  check("vocabulary: an unknown sample has no ambiguity or different-form alert", !ids.includes("ambiguity") && !ids.includes("different_form") && !ids.includes("spectral_twin"), ids.join(","));
  await unknown.ctx.close();
}
