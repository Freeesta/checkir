// Scenario run by fumo.mjs: the scaled reference of the overlay, the order of the inverse search and the agreement of a region come from the engine; the page ricalculates none of them.
import { readFile } from "node:fs/promises";

const WEB = new URL("../../web/", import.meta.url);
const read = async (name) => (await readFile(new URL(name, WEB), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

/** Lorentz bands on 600-3800 cm-1 (step 2) with a small baseline: [centre, half width, height]. */
function lorentz(bands) {
  const x = [], y = [];
  for (let v = 600; v <= 3800; v += 2) {
    x.push(v);
    y.push(0.01 + bands.reduce((s, [c, w, h]) => s + h / (1 + ((v - c) / w) ** 2), 0));
  }
  return { x, y };
}

export default async ({ browser, base, check }) => {
  // The page keeps no copy of the three calculations.
  const match = await read("match.js"), inverse = await read("inverse.js"), peaks = await read("peaks.js"), reference = await read("reference.js"), worker = await read("match.worker.js");
  check("overlay: match.js no longer scales the reference", !/referenceFor|own \/ ref/.test(match) && /reference_scale\(/.test(reference) && /reference_scaled\(/.test(reference));
  check("overlay: the scaled reference is not computed in the page", !/\bscale\s*=\s*ref\b|\*\s*scale/.test(reference));
  check("inverse: the page keeps the order of the engine (no sort, no relevance function)", !/\.sort\(|byRelevance/.test(inverse) && /peak_index_query_all/.test(worker));
  check("ranges: the agreement of an r is read from the engine (no limit compared in the page)", !/agree_min|partial_min/.test(peaks) && /region_agreement_of/.test(peaks));

  const ctx = await browser.newContext({ locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const sample = lorentz([[1700, 8, 0.5], [2100, 8, 3], [1000, 8, 0.2]]);
  const library = lorentz([[1700, 8, 2], [2100, 8, 9], [1000, 8, 0.8]]);
  const a = lorentz([[1712, 8, 1], [1275, 6, 0.2]]), b = lorentz([[1712, 8, 1], [1275, 6, 0.9]]), c = lorentz([[1708, 8, 1]]), d = lorentz([[1275, 6, 0.5], [1000, 10, 1]]);
  const got = await page.evaluate(async ({ sample, library, spectra }) => {
    const engine = await (await import("./engine.js")).loadEngine();
    const f = (v) => Float64Array.from(v);
    const args = [f(sample.x), f(sample.y), f(library.x), f(library.y), 1900, 2400];
    const scale = engine.reference_scale(...args);
    const scaled = Array.from(engine.reference_scaled(...args));
    const states = [0.95, 0.8, 0.3, Number.NaN].map((r) => engine.region_agreement_of(r, ""));
    for (const [lib, list] of Object.entries(spectra)) {
      engine.peak_index_begin(lib, "v1");
      for (const s of list) engine.peak_index_add(lib, "absorbance", f(s.x), f(s.y));
      engine.peak_index_finish(lib);
    }
    const query = JSON.stringify({ peaks: [{ position_cm1: 1712 }, { position_cm1: 1275 }], min_found: 1 });
    const all = JSON.parse(engine.peak_index_query_all(JSON.stringify(["l1", "l2", "nope"]), query));
    const own = ["l1", "l2"].flatMap((lib) => JSON.parse(engine.peak_index_query(lib, query)).hits.map((h) => ({ ...h, lib })));
    engine.peak_index_remove("l1");
    engine.peak_index_remove("l2");
    return { scale, ratio: scaled[100] / library.y[100], states, all, own };
  }, { sample, library, spectra: { l1: [a, c], l2: [b, d] } });
  check("overlay: the engine scales the reference to the highest band outside the excluded zone (1700, not 2100)", Math.abs(got.scale - 0.25) < 0.02 && Math.abs(got.ratio - got.scale) < 1e-9, JSON.stringify([got.scale, got.ratio]));
  check("ranges: the engine names the agreement of an r (agrees, partial, disagrees, unknown)", got.states.join() === "agrees,partial,disagrees,unknown", got.states.join());
  const order = got.all.hits.map((h) => `${h.lib}/${h.spectrum}/${h.found}`);
  check("inverse: the merged list has every hit of both libraries, two bands first, then the stronger single band", got.all.hits.length === got.own.length && got.all.hits.length === 4 && got.all.hits.map((h) => h.found).join() === "2,2,1,1" && got.all.hits[0].lib === "l2" && got.all.hits[2].lib === "l1", order.join(" "));
  check("inverse: the libraries without an index are not an error of the search", got.all.failed === 0 && got.all.truncated === false);
  await ctx.close();
};
