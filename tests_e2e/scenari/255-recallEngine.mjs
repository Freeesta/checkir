// Scenario run by fumo.mjs: the numbers of a recalled reference come from the engine and agree with the comparison row of the same candidate.
import { pick, prepare } from "../richiamo.mjs";

export default async ({ browser, base, check }) => {
  const { ctx, page } = await prepare(browser, base);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  await page.waitForSelector("dialog #recall-q");
  await pick(page, "bet");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#recall:not([hidden]) .recall-item");
  const read = (scale) =>
    page.evaluate(
      async ([root, sc]) => {
        const recall = await import(`${root}recall.js`);
        const state = await import(`${root}state.js`);
        state.update({ recall: { ...state.getState().recall, scale: sc } });
        const s = state.getState();
        const row = recall.recallView(s).rows[0];
        const cand = state.resultOf(s)?.data.candidates.find((c) => c.library === row.ref.library && c.spectrum_id === row.ref.spectrumId);
        return { k: row.k, rDerivative: row.rDerivative, rSpectrum: row.rSpectrum, candidate: cand?.r_derivative };
      },
      [new URL(".", page.url()).href, scale],
    );
  const raw = await read("raw");
  // The library matrix is single precision, the recall is double on the same grid: they agree to 1e-6.
  check("recall engine: r of the recall is the r of the candidate row", typeof raw.candidate === "number" && Math.abs(raw.rDerivative - raw.candidate) < 1e-6, JSON.stringify(raw));
  check("recall engine: raw scale is 1 and the spectrum r is a number", raw.k === 1 && Number.isFinite(raw.rSpectrum));
  const max = await read("max");
  const lsq = await read("lsq");
  check("recall engine: max and lsq give a positive factor, the correlations do not depend on the scale", max.k > 0 && lsq.k > 0 && max.rDerivative === raw.rDerivative && lsq.rSpectrum === raw.rSpectrum, JSON.stringify([max, lsq]));
  await ctx.close();
};
