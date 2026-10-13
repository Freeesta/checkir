// Mixture proposal e2e: a synthetic sample 0.7·beta + 0.3·alfa against the library alfa/beta/gamma gives «Mixture: beta + alfa» above the table with the
// contribution of each and no unexplained peak; a pure beta gives no proposal; the mixture is taken at level 4; sheet, report and peak markers name the components.
import { ALFA, BETA, jcamp } from "../confronto.mjs";
import { importLibrary } from "../sottrazione.mjs";

const NOISE = 0.01;
const scale = (bands, k) => bands.map(([c, h, w]) => [c, h * k, w]);

/** A JCAMP file with a little noise from a fixed seed (a measured spectrum is never noiseless). */
function noisy(name, bands) {
  let seed = 4321;
  const uniform = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise = () => (uniform() - 0.5) * 2 * NOISE;
  const lines = jcamp(name, bands).toString("latin1").split("\n").map((line) => (/^\d+, [\d.]+$/.test(line) ? line.replace(/, ([\d.]+)$/, (_, y) => `, ${(Number(y) + noise()).toFixed(6)}`) : line));
  return Buffer.from(lines.join("\n"));
}

async function start(browser, base, width, name, bands) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width, height: width < 400 ? 640 : 768 } });
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

const inPage = (page, fn) => page.evaluate(async (src) => new Function(`return (async () => { ${src} })()`)(), fn);

async function proposalScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await start(browser, base, 1366, "campione_miscela.jdx", [...scale(BETA, 0.7), ...scale(ALFA, 0.3)]);
  await page.waitForSelector("[data-mixture]", { timeout: 40000 });
  const text = (await page.textContent("[data-mixture]")) ?? "";
  const title = (await page.textContent("[data-mixture] .mixture-line strong")) ?? "";
  check("mixture: the proposal names beta and alfa above the table", /^Miscela: beta \+ alfa$/i.test(title.trim()) || /^Miscela: alfa \+ beta$/i.test(title.trim()), title);
  check("mixture: it sits before the candidates", await page.evaluate(() => { const m = document.querySelector("[data-mixture]"); const l = document.querySelector(".result .cands"); return !!m && !!l && !!(m.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  check("mixture: two parts, each with a contribution and the peaks it explains", (await page.locator("[data-mixture] .mixture-part").count()) === 2 && (text.match(/quota del segnale \d\.\d\d/g) ?? []).length === 2 && (text.match(/picchi spiegati \d+/g) ?? []).length === 2, text);
  check("mixture: no unexplained peak", (await page.getAttribute("[data-mixture] .mixture-left", "data-unexplained")) === "0" && /Picchi non spiegati: 0/.test(text), text);
  check("mixture: never a percentage or an amount", !/%|quantit/i.test(text), text);
  const v = await axe(page);
  check("mixture: axe has no violations", v.length === 0, v.join(", "));
  const sheet = await inPage(page, `const s = await import("./state.js"); const m = await import("./sheet.js"); return m.buildSheet(s.getState()).textContent;`);
  check("mixture: the sheet lists the possible mixture before it is accepted", /Possibile miscela: .*(alfa|beta)/.test(sheet), sheet);
  await page.click('[data-fk="mixture-accept"]');
  const draft = await inPage(page, `const s = await import("./state.js"); return s.getState().draft.C1;`);
  check("mixture: accepting sets level 4 with both components", draft?.level === 4 && draft.keys.length === 2 && new Set(draft.keys).size === 2, JSON.stringify(draft));
  check("mixture: the button is pressed and the proposal stays", (await page.getAttribute('[data-fk="mixture-accept"]', "aria-pressed")) === "true");
  const taken = await inPage(page, `const s = await import("./state.js"); const m = await import("./sheet.js"); return m.buildSheet(s.getState()).textContent;`);
  check("mixture: the sheet names the components at level 4", /Componenti principali: .*(alfa|beta)/i.test(taken) && /alfa/i.test(taken) && /beta/i.test(taken), taken);
  const report = await inPage(page, `const s = await import("./state.js"); const m = await import("./report.js"); const r = m.buildReport(s.getState()); return [...r.querySelectorAll('[data-report="mixture"] tbody tr')].map((tr) => tr.textContent);`);
  check("mixture: the A4 report lists the components", report.length === 2 && report.some((r) => /alfa/i.test(r)) && report.some((r) => /beta/i.test(r)), report.join(" | "));
  const marks = await inPage(page, `const s = await import("./state.js"); const p = await import("./peaks.js"); s.update({ showPeaks: true }); const a = p.analyse(s.getState()); return a.peaks.filter((x) => x.state === "explained").map((x) => x.byName);`);
  check("mixture: the markers name the component that explains each peak", marks.some((n) => /alfa/i.test(n ?? "")) && marks.some((n) => /beta/i.test(n ?? "")), JSON.stringify(marks));
  check("mixture: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function pureScenario(browser, base, check) {
  const { ctx, page } = await start(browser, base, 1366, "campione_beta.jdx", BETA);
  await page.waitForTimeout(4000);
  check("mixture: a pure beta gets no proposal", (await page.locator("[data-mixture]").count()) === 0 && /beta/i.test((await page.locator(".result .cand-name").first().textContent()) ?? ""));
  await ctx.close();
}

async function phoneScenario(browser, base, check, axe) {
  const { ctx, page } = await start(browser, base, 320, "campione_miscela.jdx", [...scale(BETA, 0.7), ...scale(ALFA, 0.3)]);
  await page.waitForSelector("[data-mixture]", { timeout: 40000 });
  check("mixture: 320 px has no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const v = await axe(page);
  check("mixture: 320 px axe has no violations", v.length === 0, v.join(", "));
  await ctx.close();
}

export default async function mixtureScenario({ browser, base, check, axe }) {
  await proposalScenario(browser, base, check, axe);
  await pureScenario(browser, base, check);
  await phoneScenario(browser, base, check, axe);
}
