// Scenario run by fumo.mjs: the thresholds the page used to copy now come from the engine (intensity class of a peak, over-subtraction, grid / mask / limits).
import { readFile } from "node:fs/promises";

const WEB = new URL("../../web/", import.meta.url);
const read = async (url) => readFile(url, "utf8");

/** Lorentz bands on 600–3800 cm-1, step 2, absorbance. */
function spectrumOf(bands) {
  const x = [], y = [];
  for (let v = 600; v <= 3800; v += 2) {
    x.push(v);
    y.push(bands.reduce((s, [c, w, h]) => s + h / (1 + ((v - c) / w) ** 2), 0));
  }
  return { role: "sample", y_unit: "absorbance", wavenumber_cm1: x, y };
}

export default async ({ browser, base, check }) => {
  // No threshold constant left in the page files.
  const peaks = await read(new URL("peaks.js", WEB));
  const subtract = await read(new URL("subtract.js", WEB));
  const ranges = await read(new URL("ranges.js", WEB));
  const match = await read(new URL("match.js", WEB));
  check("thresholds: peaks.js keeps no intensity cuts", !/STRONG_MIN|MEDIUM_MIN|intensityOf|prominence_rel/.test(peaks));
  check("thresholds: subtract.js keeps no over-subtraction ratio", !/OVER_RATIO/.test(subtract) && /over_subtraction/.test(subtract));
  check("thresholds: ranges.js keeps no grid, mask or limit numbers", !/\b(650|3800|1900|2400|400|150)\b/.test(ranges.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("thresholds: match.js keeps no grid or mask numbers", !/\b(650|1900|2400)\b/.test(match.replace(/\/\*[\s\S]*?\*\//g, "")));

  const th = JSON.parse(await read(new URL("../../data/soglie/peaks_thresholds-1.json", import.meta.url)));
  const cmp = JSON.parse(await read(new URL("../../data/soglie_confronto.json", import.meta.url)));
  const cuts = th.tolerances.intensity_classes;
  const ctx = await browser.newContext({ locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const bands = [[3000, 20, 0.3], [1700, 8, 1.0], [1450, 10, 0.5], [1250, 6, 0.4], [1000, 12, 0.7], [800, 9, 0.12]];
  const got = await page.evaluate(async (spectrum) => {
    const engine = await (await import("./engine.js")).loadEngine();
    const limits = await import("./engine_limits.js");
    const list = JSON.parse(engine.detect_peaks(JSON.stringify(spectrum), ""));
    const ref = Float64Array.from(spectrum.y);
    const x = Float64Array.from(spectrum.wavenumber_cm1);
    const sample = Float64Array.from(spectrum.y, (v) => v * 0.2);
    const sub = JSON.parse(engine.sottrai("absorbance", x, sample, "absorbance", x, ref, JSON.stringify({ k: 1, baseline: false })));
    const ok = JSON.parse(engine.sottrai("absorbance", x, ref, "absorbance", x, sample, JSON.stringify({ k: 0.2, baseline: false })));
    return { peaks: list.peaks, over: sub.over_subtraction, notOver: ok.over_subtraction, limits: JSON.parse(JSON.stringify({ g: limits.GRID, m: limits.MASK_CM1, l: limits.LIMITS })) };
  }, spectrumOf(bands));
  const classOf = (r) => (r >= cuts.strong_rel_min ? "strong" : r >= cuts.medium_rel_min ? "medium" : "weak");
  check("thresholds: every peak carries the class the thresholds file gives", got.peaks.length >= 5 && got.peaks.every((p) => p.intensity === classOf(p.prominence_rel)), JSON.stringify(got.peaks.map((p) => [p.prominence_rel, p.intensity])));
  check("thresholds: the three classes occur on the test spectrum", new Set(got.peaks.map((p) => p.intensity)).size === 3);
  check("thresholds: subtracting five times the sample flags over-subtraction, the right factor does not", got.over === true && got.notOver === false, JSON.stringify([got.over, got.notOver]));
  check("thresholds: grid, mask and limits of the page are the engine's (soglie_confronto.json)", got.limits.g.from === 650 && got.limits.g.to === 3800 && got.limits.g.step === 2 && got.limits.m[0] === 1900 && got.limits.m[1] === 2400 && got.limits.l.minCm1 === cmp.range_limits.min_cm1 && got.limits.l.minPoints === cmp.range_limits.min_points, JSON.stringify(got.limits));
  await ctx.close();
};
