// Work-area e2e: spectrum, level and candidates in one view without scrolling, the overlay by itself, the folded data table,
// the path from file to printed sheet in few actions, no green on results, and the sample in one colour.
import { ALFA, BETA, GAMMA, jcamp } from "./confronto.mjs";

const hueOf = (rgb) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => Number(x) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 0.08) return -1; // grey: no hue
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const isGreen = (rgb) => {
  const h = hueOf(rgb);
  return h >= 70 && h <= 170;
};

/** A private library of three synthetic spectra, as in the comparison e2e. */
async function addLibrary(page) {
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "alfa.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa", ALFA) },
    { name: "beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) },
    { name: "gamma.jdx", mimeType: "application/octet-stream", buffer: jcamp("gamma", GAMMA) },
  ]);
  await page.waitForFunction(() => /3/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
}

/** The folded data table, no green on results, the sample in one colour. */
async function tableAndColours(page, check) {
  // The data table: folded, with its row count in the title, and still in the page.
  const table = await page.evaluate(() => ({ open: document.getElementById("table-section").open, title: document.querySelector("#table-section > summary").textContent, tables: document.querySelectorAll("#table table").length, rows: document.querySelectorAll("#table tbody tr").length }));
  check("area: the data table is folded, its title has the row count, the table is in the page", !table.open && table.tables === 1 && table.title.includes(`(${table.rows} righe)`) && table.rows > 0, JSON.stringify(table));
  await page.click("#table-section > summary");
  check("area: opening the data table shows the rows", await page.isVisible("#table tbody tr"));
  await page.click("#table-section > summary");

  // No green on results; the sample is one colour everywhere.
  const colours = await page.evaluate(() => {
    // A full coverage bar is not drawn, so the colours are read from a partial one added for the purpose.
    const m = document.querySelector(".cand meter") ?? document.querySelector(".cand")?.appendChild(Object.assign(document.createElement("meter"), { min: 0, max: 1, value: 0.5 }));
    const sample = document.createElement("i");
    sample.style.color = "var(--color-sample)";
    document.body.append(sample);
    const out = { sample: getComputedStyle(sample).color, curve: getComputedStyle(document.querySelector("#chart polyline.curve")).stroke, bar: getComputedStyle(m).backgroundColor, value: [...["::-webkit-meter-optimum-value", "::-webkit-meter-suboptimum-value", "::-webkit-meter-even-less-good-value"]].map((p) => getComputedStyle(m, p).backgroundColor), seg: [...document.querySelectorAll(".result .level .seg.on")].map((x) => getComputedStyle(x).backgroundColor) };
    sample.remove();
    if (!document.querySelector(".cand meter[aria-label]")) m.remove();
    return out;
  });
  check("area: the meters and the level marks have no green", !colours.value.some(isGreen) && !isGreen(colours.bar) && !colours.seg.some(isGreen), JSON.stringify(colours));
  check("area: the sample curve has the sample colour", colours.curve === colours.sample, JSON.stringify(colours));
}

/** @param {import("playwright").Browser} browser */
export async function areaScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await addLibrary(page);
  await page.evaluate(() => (window.print = () => (window.__printed = (window.__printed ?? 0) + 1)));

  // The path from file to printed sheet, counting every click and key: open (1), sign (2), sheet (3), print (4); the result needs none.
  let actions = 0;
  await page.evaluate(() => {
    window.__tops = [];
    const host = document.getElementById("candidates");
    new MutationObserver(() => host.hasAttribute("data-open") && window.__tops.push(document.getElementById("table-section").getBoundingClientRect().top)).observe(host, { attributes: true, childList: true, subtree: true });
  });
  await page.setInputFiles("input[type=file]", [{ name: "campione_beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) }]);
  actions++;
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  const tops = await page.evaluate(() => window.__tops);
  check("area: the result arriving moves nothing below it", tops.length > 1 && Math.max(...tops) - Math.min(...tops) <= 1, JSON.stringify(tops));

  const box = async (sel) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().bottom ?? 9999, sel);
  check("area: at 1366x768 the spectrum, the level and the first three candidates are above the fold", (await box("#chart")) <= 768 && (await box(".result .level")) <= 768 && (await box(".cand:nth-child(3)")) <= 768, `${await box("#chart")} ${await box(".result .level")} ${await box(".cand:nth-child(3)")}`);
  check("area: the candidates sit under the chart, five at most, with the level in words", (await page.locator("#main-content .cand").count()) <= 5 && (await page.locator("#main-content .cand").count()) >= 3 && /Probabile/.test((await page.textContent(".result .level")) ?? ""));
  check("area: a row has the whole name, the score and the margin on the first", /beta/i.test((await page.textContent(".cand .cand-name")) ?? "") && /^\d{1,3}$/.test((await page.textContent(".cand .cand-r")) ?? "") && /^margine \d{1,3}$/.test((await page.textContent(".cand .cand-delta")) ?? ""));
  check("area: section 3 of the panel is a summary, the list is not in it", (await page.locator("#panel .cands").count()) === 0 && /Probabile/.test((await page.textContent('details[data-panel="results"]')) ?? "") && /Candidati: \d/.test((await page.textContent('details[data-panel="results"]')) ?? ""));
  check("area: the chosen candidate is overlaid without pressing anything", (await page.locator("#chart polyline.curve-reference").count()) === 1);
  const label = await page.textContent("#chart .reference-legend, #chart text.legend").catch(() => "");
  await page.focus('[data-fk="cand-0"]');
  await page.keyboard.press("ArrowDown");
  check("area: choosing another row moves the overlay with it", (await page.locator("#chart polyline.curve-reference").count()) === 1 && (await page.getAttribute('[data-fk="cand-1"]', "aria-current")) === "true", label ?? "");
  await page.click('[data-fk="cand-0"]');

  await page.keyboard.press("f");
  actions++;
  await page.keyboard.press("s");
  actions++;
  await page.click('[data-action="sheet.print"]');
  actions++;
  check("area: from file to printed sheet in 4 actions or fewer, no dialog", actions <= 4 && (await page.evaluate(() => window.__printed)) === 1 && (await page.locator("dialog[open]").count()) === 0, String(actions));

  await tableAndColours(page, check);

  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const v = await axe(page);
    check(`area: axe has no violations (${scheme}, it)`, v.length === 0, v.join(", "));
  }
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  const ven = await axe(page);
  check("area: axe has no violations (en)", ven.length === 0, ven.join(", "));
  check("area: English table title and candidates", /\(\d+ rows\)/.test((await page.textContent("#table-section > summary")) ?? "") && /Candidates|Most similar/.test((await page.textContent(".cands-title")) ?? ""));
  check("area: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();

  const phone = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const p = await phone.newPage();
  await p.goto(base);
  await p.waitForSelector("body[data-ready='1']");
  await p.setInputFiles("input[type=file]", [{ name: "x.jdx", mimeType: "application/octet-stream", buffer: jcamp("x", BETA) }]);
  await p.waitForTimeout(1500);
  check("area: 320 px has no horizontal scroll with the candidates", await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const vp = await axe(p);
  check("area: axe has no violations at 320 px", vp.length === 0, vp.join(", "));
  await phone.close();
}
