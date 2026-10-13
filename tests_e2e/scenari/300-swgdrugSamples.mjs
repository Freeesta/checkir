// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
// Samples built from the public SWGDRUG spectra (tests_e2e/campioni_swgdrug.mjs) against the public library: the 11 pure ones, perturbed, come out first at T2/T3;
// the caffeine/paracetamol 60/40 mixture shows both components; CO2 and noise raise their alerts and a clean sample does not; no request leaves the site.
import { MIXES, PURE_CASES, mixSpectrum, perturb, readPure, toCsvDescending, toJcamp } from "../campioni_swgdrug.mjs";

/** A fresh page with every request recorded; opens `file` and returns the result of the first spectrum once the table is there. */
async function open(browser, base, file) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const requests = [];
  ctx.on("request", (r) => requests.push(r.url()));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", [file]);
  if (await page.evaluate(() => document.body.dataset.section !== undefined)) await page.click(".panel-back");
  await page.waitForSelector(".result:not(.result-residual) .cand", { timeout: 40000 });
  // The public library is loaded after the page starts: the first result may come from the community one alone.
  await page.evaluate(async () => { window.__state = await import("/state.js"); });
  await page.waitForFunction(() => {
    const st = window.__state;
    return (st.resultOf(st.getState())?.data?.libraries ?? []).some((l) => l.id === "swgdrug-ir" && l.searched && l.spectra === 11);
  }, null, { timeout: 40000 });
  const data = await page.evaluate(async () => {
    const s = await import("/state.js");
    return s.resultOf(s.getState())?.data ?? null;
  });
  return { ctx, page, data, requests, errors };
}

const jdx = (name, spectrum) => ({ name: `${name}.jdx`, mimeType: "chemical/x-jcamp-dx", buffer: toJcamp(name, spectrum) });
const alertIds = (data) => (data?.alerts ?? []).map((a) => a.id);
const outside = (base, requests) => requests.filter((u) => !u.startsWith(base) && !u.startsWith("blob:") && !u.startsWith("data:"));

export default async ({ browser, base, check }) => {
  const external = [];

  for (const c of PURE_CASES) {
    const sample = perturb(readPure(c.substance, c.id), c.options);
    const { ctx, data, requests, errors } = await open(browser, base, jdx(c.name, sample));
    const top = data?.candidates?.[0];
    check(`swgdrug: ${c.id} comes first`, top?.spectrum_id === c.id && top?.library === "swgdrug-ir", JSON.stringify(top));
    check(`swgdrug: ${c.id} is proposed at T2 or T3, never T4`, data?.tier === "T2" || data?.tier === "T3", String(data?.tier));
    check(`swgdrug: ${c.id} raises no measurement alert`, !alertIds(data).some((id) => id.startsWith("quality_")), alertIds(data).join());
    check(`swgdrug: ${c.id} has no page error`, errors.length === 0, errors.join(" | "));
    external.push(...outside(base, requests));
    await ctx.close();
  }

  // Descending CSV, coarse step and a shift: the reader and the grid do not change the answer.
  const csvSample = perturb(readPure("caffeine", "caffeine-base.swgdrug.357"), { step: 4, shift: 1.5, scale: 0.7, slope: 0.05, noise: 0.002, seed: 21 });
  const csv = await open(browser, base, { name: "caffeina_discendente.csv", mimeType: "text/csv", buffer: toCsvDescending(csvSample) });
  check("swgdrug: a descending CSV finds caffeine first", csv.data?.candidates?.[0]?.spectrum_id === "caffeine-base.swgdrug.357", JSON.stringify(csv.data?.candidates?.[0]));
  check("swgdrug: the CSV result is T2 or T3", csv.data?.tier === "T2" || csv.data?.tier === "T3", String(csv.data?.tier));
  external.push(...outside(base, csv.requests));
  await csv.ctx.close();

  // CO2 at 2350 inside the masked window: the alert is raised and the identification is the same.
  const co2Sample = perturb(readPure("paracetamol", "paracetamol-neutral.swgdrug.354"), { step: 2, co2: 0.08, noise: 0.002, seed: 31 });
  const co2 = await open(browser, base, jdx("paracetamolo_co2", co2Sample));
  check("swgdrug: a CO2 band raises quality_co2_vapour", alertIds(co2.data).includes("quality_co2_vapour"), alertIds(co2.data).join());
  check("swgdrug: with CO2 paracetamol is still first", co2.data?.candidates?.[0]?.spectrum_id === "paracetamol-neutral.swgdrug.354", JSON.stringify(co2.data?.candidates?.[0]));
  check("swgdrug: the CO2 alert is on the page", (await co2.page.locator('.alert[data-alert="quality_co2_vapour"]').count()) === 1);
  external.push(...outside(base, co2.requests));
  await co2.ctx.close();

  // Heavy noise: the noise alert, and no CO2 alert on a spectrum without it.
  const noisySample = perturb(readPure("caffeine", "caffeine-base.swgdrug.357"), { step: 2, noise: 0.03, seed: 41 });
  const noisy = await open(browser, base, jdx("caffeina_rumore", noisySample));
  check("swgdrug: a noisy sample raises quality_noise", alertIds(noisy.data).includes("quality_noise"), alertIds(noisy.data).join());
  check("swgdrug: noise alone does not raise CO2", !alertIds(noisy.data).includes("quality_co2_vapour"), alertIds(noisy.data).join());
  external.push(...outside(base, noisy.requests));
  await noisy.ctx.close();

  // Mixtures: the 60/40 caffeine/paracetamol has both among the first candidates and says nothing like an amount.
  for (const m of MIXES) {
    const { ctx, page, data, requests } = await open(browser, base, jdx(m.name, mixSpectrum(m, 51)));
    const wanted = m.parts.map((p) => String(p[0]));
    const first = (data?.candidates ?? []).slice(0, m.parts.length + 2).map((c) => c.substance ?? c.display_name?.toLowerCase());
    if (m.name === "mix_60_40") {
      check("swgdrug: the 60/40 mixture has caffeine and paracetamol among the first candidates", wanted.every((w) => first.some((f) => String(f).includes(w))), first.join());
      await page.waitForSelector("[data-mixture]", { timeout: 40000 }).catch(() => {});
      const text = (await page.locator("[data-mixture]").first().textContent().catch(() => "")) ?? "";
      check("swgdrug: the 60/40 mixture is proposed with both components", /caffe/i.test(text) && /paracetamol/i.test(text), text);
      check("swgdrug: the proposal gives no percentage", !/%/.test(text), text);
    } else {
      check(`swgdrug: ${m.name} is never a confident single substance`, data?.tier !== "T2" || wanted.includes(String(data?.candidates?.[0]?.substance)), `${data?.tier} ${first.join()}`);
    }
    external.push(...outside(base, requests));
    await ctx.close();
  }

  check("swgdrug: no request left the site", external.length === 0, external.join(", "));
};
