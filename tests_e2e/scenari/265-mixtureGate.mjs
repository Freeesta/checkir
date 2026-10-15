// Gate of the mixture proposal (engine, ftir-core::miscele): against a library example-a/caffeine/paracetamol/lactose/levamisole an unknown sample gets
// no proposal; an unknown that two components cannot explain gets the reason instead of a mixture (no accept button); 60/40 and 80/20 give both
// components; 90/10 names the minor component or gives the reason. axe and 320 px on the rejected view.
import { jcamp } from "../confronto.mjs";
import { importAs } from "../importa_aiuto.mjs";

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
  for (const name of [/swgdrug-ir/]) {
    await openPanel(page, "libraries");
    const box = page.getByRole("checkbox", { name });
    if (await box.isChecked()) await box.click();
  }
  await openPanel(page, "libraries");
  const files = Object.entries(LIBRARY).map(([name, bands]) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) }));
  await importAs(page, "Cancello", files);
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

/** The names of the proposed components, or the reason of the rejection. */
async function outcome(page) {
  await page.waitForSelector("[data-mixture], [data-mixture-rejected]", { timeout: 40000 });
  const rejected = (await page.locator("[data-mixture-rejected]").count()) ? await page.getAttribute("[data-mixture-rejected]", "data-mixture-rejected") : null;
  const parts = await page.locator("[data-mixture] .mixture-part").evaluateAll((li) => li.map((x) => ({ name: (x.querySelector("strong")?.textContent ?? "").trim().toLowerCase(), minor: !!x.querySelector("[data-minor]") })));
  return { rejected, parts, text: (await page.textContent("[data-mixture], [data-mixture-rejected]")) ?? "" };
}

async function unknownScenario(browser, base, check) {
  const { ctx, page, errors } = await start(browser, base, 1366, "ignoto.jdx", UNKNOWN);
  await page.waitForTimeout(5000);
  check("gate: an unknown sample gets no mixture proposal", (await page.locator("[data-mixture]").count()) === 0);
  check("gate: no page errors (unknown)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function rejectedScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await start(browser, base, 1366, "ignoto_misto.jdx", mix([UNKNOWN, 1], [ACTIVE, 0.5], [CAFFEINE, 0.4]));
  const o = await outcome(page);
  check("gate: two components that leave most of the spectrum unexplained give the reason, not a mixture", o.rejected === "high_residual" && o.parts.length === 0, JSON.stringify(o));
  check("gate: the reason says no mixture is proposed and shows the unexplained share", /^Nessuna miscela proposta: .* \d\.\d\d della varianza\.$/.test(o.text.trim()), o.text);
  check("gate: a rejected proposal has no accept button", (await page.locator('[data-fk="mixture-accept"]').count()) === 0);
  const v = await axe(page);
  check("gate: axe has no violations on the reason", v.length === 0, v.join(", "));
  check("gate: no page errors (rejected)", errors.length === 0, errors.join(" | "));
  await ctx.close();
  const phone = await start(browser, base, 320, "ignoto_misto.jdx", mix([UNKNOWN, 1], [ACTIVE, 0.5], [CAFFEINE, 0.4]), "en-GB");
  const p = await outcome(phone.page);
  check("gate: the reason in English", /^No mixture proposed: .* \d\.\d\d of the variance unexplained\.$/.test(p.text.trim()), p.text);
  check("gate: 320 px has no horizontal scroll", await phone.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.ctx.close();
}

async function proposedScenario(browser, base, check, name, bands, want) {
  const { ctx, page, errors } = await start(browser, base, 1366, `${name}.jdx`, bands);
  const o = await outcome(page);
  const ids = o.parts.map((p) => p.name).sort();
  check(`gate: ${name} gives both components`, o.rejected === null && JSON.stringify(ids) === JSON.stringify(want), JSON.stringify(o));
  check(`gate: ${name} each component explains peaks`, (o.text.match(/picchi spiegati [1-9]\d*/g) ?? []).length === 2, o.text);
  check(`gate: no page errors (${name})`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function minorScenario(browser, base, check) {
  const { ctx, page, errors } = await start(browser, base, 1366, "caffeina_90_10.jdx", mix([CAFFEINE, 0.9], [PARACETAMOL, 0.1]));
  const o = await outcome(page);
  const minor = o.parts.find((p) => p.name === "paracetamol");
  check("gate: 90/10 names the minor component or gives the reason", (minor?.minor === true && /componente minore/.test(o.text)) || o.rejected !== null, JSON.stringify(o));
  check("gate: no page errors (90/10)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

export default async function mixtureGateScenario({ browser, base, check, axe }) {
  await unknownScenario(browser, base, check);
  await rejectedScenario(browser, base, check, axe);
  await proposedScenario(browser, base, check, "esempio_60_40", mix([ACTIVE, 0.6], [CAFFEINE, 0.4]), ["caffeine", "example-a"]);
  await proposedScenario(browser, base, check, "lattosio_80_20", mix([LACTOSE, 0.8], [LEVAMISOLE, 0.2]), ["lactose", "levamisole"]);
  await minorScenario(browser, base, check);
}
