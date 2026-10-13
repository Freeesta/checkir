// Scenario: the same substance as absorbance, %T and fraction T (JCAMP ##YUNITS=TRANSMITTANCE) gives the same first candidate and r ±0.01; axis and CSV follow the unit.
import { ALFA, BETA, GAMMA, jcamp } from "../confronto.mjs";

/** Same Lorentzian bands as `jcamp`, written in the unit asked: `absorbance`, `percent` (%T) or `fraction` (T from 0 to 1). */
function file(title, bands, unit) {
  const rows = [];
  for (let x = 400; x <= 4000; x += 2) {
    let a = 0.01;
    for (const [c, h, w] of bands) a += h / (1 + ((x - c) / w) ** 2);
    const y = unit === "absorbance" ? a : unit === "percent" ? 100 * 10 ** -a : 10 ** -a;
    rows.push(`${x}, ${y.toFixed(6)}`);
  }
  const yunits = unit === "absorbance" ? "ABSORBANCE" : "TRANSMITTANCE";
  return Buffer.from(["##TITLE=" + title, "##JCAMP-DX=4.24", "##DATA TYPE=INFRARED SPECTRUM", "##XUNITS=1/CM", `##YUNITS=${yunits}`, "##XFACTOR=1", "##YFACTOR=1", `##NPOINTS=${rows.length}`, "##XYPOINTS=(XY..XY)", ...rows, "##END=", ""].join("\n"));
}

export default async ({ browser, base, check }) => {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const panel = page.locator('details[data-panel="libraries"]');
  if (!(await panel.evaluate((d) => d.open))) await panel.locator("summary").click();
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "alfa.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa", ALFA) },
    { name: "beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) },
    { name: "gamma.jdx", mimeType: "application/octet-stream", buffer: jcamp("gamma", GAMMA) },
  ]);
  await page.locator('[data-library="sintetica"]').waitFor();
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));

  const results = page.locator('details[data-panel="results"]');
  if (!(await results.evaluate((d) => d.open))) await results.locator("summary").click();
  const answers = {};
  for (const unit of ["absorbance", "percent", "fraction"]) {
    await page.setInputFiles("input[type=file]", [{ name: `beta_${unit}.jdx`, mimeType: "chemical/x-jcamp-dx", buffer: file(`beta_${unit}`, BETA, unit) }]);
    await page.waitForFunction((n) => document.querySelector(".result[data-level]"), `beta_${unit}`, { timeout: 30000 });
    await page.waitForTimeout(500);
    answers[unit] = await page.evaluate(async (name) => {
      const s = await import("/state.js");
      const st = s.getState();
      const f = st.files.find((x) => x.name === name);
      const c = st.results[f.code].data.candidates[0];
      return { id: c.display_name, r: c.r_derivative, unit: (await import("/files.js")).spectrumOf(f.code)?.y_unit ?? null, error: st.matchError?.key ?? null };
    }, `beta_${unit}.jdx`);
  }
  const { absorbance: a, percent: p, fraction: f } = answers;
  check("transmittance: the first candidate is beta in the three units", [a, p, f].every((x) => /beta/i.test(x.id)), JSON.stringify(answers));
  check("transmittance: r in %T and in fraction is within 0.01 of the absorbance one", Math.abs(p.r - a.r) <= 0.01 && Math.abs(f.r - a.r) <= 0.01, JSON.stringify(answers));
  check("transmittance: the page passes the reader unit unchanged", p.unit === "TransmittancePercent" && f.unit === "TransmittanceFraction", JSON.stringify(answers));

  // Axis and CSV of the fraction spectrum (the active one is the last loaded).
  const view = await page.evaluate(async () => {
    const s = await import("/state.js");
    const e = await import("/export.js");
    const st = s.getState();
    const file = s.activeFile(st);
    return { csv: e.spectrumCsv((await import("/files.js")).spectrumOf(file.code)).split("\n")[0], axis: document.querySelector("#chart")?.textContent ?? "" };
  });
  check("transmittance: the CSV header names the unit", view.csv === "wavenumber_cm1,transmittance_fraction", view.csv);
  check("transmittance: the chart axis says transmittance", /Trasmittanza/.test(view.axis), view.axis.slice(0, 200));
  check("transmittance: no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
};
