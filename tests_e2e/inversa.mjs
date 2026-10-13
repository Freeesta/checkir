// Peak index e2e: the worker builds the index of a private synthetic library, answers "which spectra have a band here?", keeps the index in the
// OPFS cache and finds it again after a reload. Known answers from the synthetic bands; no page for the search yet, so the page modules are called.
import { ALFA, ALFA_BIS, BETA, GAMMA, jcamp } from "./confronto.mjs";

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

async function libraryPage(browser, base) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  return { ctx, page, errors };
}

/** Wait for the index of `id`, then run the queries; returns the parsed answers. */
async function ask(page, queries) {
  return page.evaluate(async (qs) => {
    const m = await import("./match.js");
    const until = Date.now() + 20000;
    while (!m.peakIndexStatus("sintetica")?.ready && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    const out = [];
    for (const q of qs) {
      const a = await m.searchPeaks(q);
      const parsed = a ? JSON.parse(a.json) : null;
      const hits = (parsed?.hits ?? []).filter((h) => h.lib === "sintetica");
      out.push({ missing: a?.missing, answers: parsed?.error_key ? [parsed] : parsed ? [{ total: hits.length, hits }] : [] });
    }
    return { status: m.peakIndexStatus("sintetica"), out };
  }, queries);
}

const QUERIES = [
  { peaks: [{ position_cm1: 1000 }] },
  { peaks: [{ position_cm1: 1000 }, { position_cm1: 1250 }] },
  { peaks: [{ position_cm1: 1000 }], absent: [{ from_cm1: 3000, to_cm1: 3200 }] },
  { peaks: [{ position_cm1: 1000 }, { position_cm1: 1250 }, { position_cm1: 1350 }], min_found: 1 },
  { peaks: [] },
];

async function cacheFiles(page) {
  return page.evaluate(async () => {
    try {
      const top = await navigator.storage.getDirectory();
      const dir = await (await top.getDirectoryHandle("checkir-cache")).getDirectoryHandle("peak-index");
      const names = [];
      for await (const [name] of dir.entries()) names.push(name);
      return names;
    } catch {
      return [];
    }
  });
}

/** The search dialog: key q, a band, a second band, an absence, then the recall of a result. */
async function dialogScenario(page, check, axe) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("q");
  await page.waitForSelector("dialog.inverse-dialog[open]");
  await page.fill("#inverse-pos", "1000");
  await page.click('[data-fk="inverse-add"]');
  await page.waitForSelector(".inverse-table tbody");
  const names = await page.$$eval(".inverse-table tbody th", (h) => h.map((x) => x.textContent));
  check("inverse ui: a band at 1000 lists the substances that have it, grouped", names.length >= 1 && (await page.$$(".inverse-table tbody tr[data-spectrum]")).length === 2, names.join(","));
  check("inverse ui: no level, no verdict word in the dialog", !/probabil|candidat|sicur/i.test(await page.textContent("dialog.inverse-dialog")));
  await page.fill("#inverse-pos", "1250");
  await page.click('[data-fk="inverse-add"]');
  await page.waitForFunction(() => /2 bande richieste|2 bands requested/.test(document.querySelector(".inverse-table caption")?.textContent ?? ""));
  await page.fill("#inverse-from", "3000");
  await page.fill("#inverse-to", "3200");
  await page.click('[data-fk="inverse-add-absent"]');
  await page.waitForSelector(".inverse-chips li >> nth=2");
  const row = page.locator(".inverse-table tbody tr[data-spectrum]").first();
  await row.locator("button").click();
  check("inverse ui: the recall button puts the spectrum among the recalled", await page.evaluate(async () => (await import("./state.js")).getState().recall.refs.length === 1));
  const violations = await axe(page);
  check("inverse ui: axe has no violations with the results open", violations.length === 0, violations.join(", "));
  await page.fill("#inverse-pos", "99999");
  await page.click('[data-fk="inverse-add"]');
  check("inverse ui: an out-of-range band is refused with a message", await page.isVisible("dialog.inverse-dialog .error"));
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.inverse-dialog", { state: "detached" });
  check("inverse ui: Escape closes the dialog", (await page.$("dialog.inverse-dialog")) === null);
}

export async function inverseScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await libraryPage(browser, base);
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  const file = (name, bands) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) });
  await page.setInputFiles('input[data-library="files"]', [file("alfa", ALFA), file("beta", BETA), file("gamma", GAMMA), file("alfa_bis", ALFA_BIS)]);
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  const first = await ask(page, QUERIES);
  const [one, both, notAbove, partial, empty] = first.out;
  check("inverse: the index of the library is ready, one entry per spectrum", first.status?.ready === true && first.status.total === 4, JSON.stringify(first.status));
  check("inverse: a band at 1000 is in the two spectra that have it", one.answers[0]?.total === 2 && one.answers[0].hits.every((h) => h.bands[0].delta_cm1 <= 6), JSON.stringify(one));
  check("inverse: two bands together keep the same two", both.answers[0]?.total === 2 && both.answers[0].hits.every((h) => h.found === 2), JSON.stringify(both));
  check("inverse: an empty range excludes the spectra with a band in it", notAbove.answers[0]?.total === 2, JSON.stringify(notAbove));
  check("inverse: with one band enough, those with two come before the one with a single band", partial.answers[0]?.total === 3 && partial.answers[0].hits.map((h) => h.found).join() === "2,2,1", JSON.stringify(partial));
  check("inverse: a query without bands is an error with a key", empty.answers[0]?.error_key === "peak_index.query_invalid", JSON.stringify(empty));
  const stored = await cacheFiles(page);
  const publicCount = await page.evaluate(async () => (await (await fetch("librerie/libraries.json")).json()).libraries.length);
  check("inverse: the index is kept in the cache, one file per library", stored.includes("sintetica.bin") && stored.length === publicCount + 1, JSON.stringify(stored));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  const again = await ask(page, QUERIES.slice(0, 1));
  check("inverse: after a reload the index is back and gives the same answer", again.status?.ready === true && again.out[0].answers[0]?.total === 2, JSON.stringify(again));
  await openPanel(page, "libraries");
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  await dialogScenario(page, check, axe);
  check("inverse: no page errors", errors.length === 0, errors.join(" | "));
  await page.evaluate(async () => {
    const m = await import("./librerie.js");
    await m.removePrivate("sintetica");
  });
  check("inverse: removing the library removes its cached index", !(await cacheFiles(page)).includes("sintetica.bin"));
  await ctx.close();
}
