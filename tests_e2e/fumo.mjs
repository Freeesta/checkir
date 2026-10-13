// Smoke e2e: the page loads, draws the synthetic spectrum with its table, is keyboard-operable, axe
// (light and dark), fits a 320 px viewport (zoom 400 %), and numbers use the decimal point in both languages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { registryScenario } from "./registri.mjs";

const SITE = new URL("../site/", import.meta.url).pathname;
const TIPI = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
const axeSource = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    res.setHeader("Content-Type", TIPI[extname(rel)] ?? "application/octet-stream");
    res.end(await readFile(join(SITE, rel)));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + detail}`);
  if (!ok) failures++;
}

async function axe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
}

/** Light and dark colour schemes: the page draws, axe is clean (also with a file loaded and with a forced data-theme). */
async function schemeScenario(browser, scheme) {
  const ctx = await browser.newContext({ colorScheme: scheme, locale: "it-IT" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check(`[${scheme}] curve and table drawn`, (await page.locator("#chart polyline.curve").count()) === 1 && (await page.locator("#table tbody tr").count()) > 10);
  check(`[${scheme}] engine version`, /\d+\.\d+\.\d+/.test(await page.textContent("#engine-version")));
  const violations = await axe(page);
  check(`[${scheme}] axe has no violations`, violations.length === 0, violations.join(", "));
  await page.click('[data-action="demo.load"]');
  const withFile = await axe(page);
  check(`[${scheme}] axe has no violations with a file loaded`, withFile.length === 0, withFile.join(", "));
  for (const forced of ["light", "dark"]) {
    await page.evaluate((m) => (document.documentElement.dataset.theme = m), forced);
    const v = await axe(page);
    check(`[${scheme}] axe has no violations with data-theme=${forced}`, v.length === 0, v.join(", "));
  }
  check(`[${scheme}] no console errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** Phone width (zoom 400 %), keyboard, decimal point, language switch. */
async function phoneScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("zoom 400 % (320 px): no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.keyboard.press("Tab");
  check("Tab: first element is the skip link", await page.evaluate(() => document.activeElement?.className === "skip"));
  await page.focus("#chart");
  const before = await page.textContent("#range");
  await page.keyboard.press("+");
  const after = await page.textContent("#range");
  check("keyboard: + zooms in", before !== after && after.includes("4000") === false, `${before} -> ${after}`);
  await page.keyboard.press("0");
  check("keyboard: 0 restores the full view", (await page.textContent("#range")) === before);
  check("numbers use the decimal point, no thousands separator", /da 400 a 4000 cm/.test(before) && !/[.,]\d{3}\b/.test(before), before);
  await page.click("#tabbar [data-goto='results']");
  check("320 px: a tab opens its section as a full page", await page.evaluate(() => document.body.dataset.section === "results" && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.click(".panel-back");
  await page.click(".menu-button");
  check("320 px: the menu shows the tools", await page.isVisible('[data-lang="en"]'));
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const axis = await page.textContent("#chart svg text:last-child");
  check("language switch to English", axis === "Absorbance", axis ?? "");
  check("table: decimal point in English", /^\d+\.\d{4}$/.test((await page.locator("#table tbody tr:first-child td:nth-child(2)").textContent()) ?? ""));
  const violationsEn = await axe(page);
  check("[en] axe has no violations", violationsEn.length === 0, violationsEn.join(", "));
  await ctx.close();
}

/** The guided "next step" button shows the first enabled step (today only "Open") and opens the file chooser. */
async function nextStepScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("next step: shows Carica", (await page.textContent("#workbar .primary"))?.trim() === "Carica");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#workbar .primary")]);
  check("next step: opens the file chooser", Boolean(chooser));
  await ctx.close();
}

/** Shell behaviour: Tab order in the header, tooltip and Esc, theme and panel preferences survive a reload, nothing of the analysis is stored. */
async function shellScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.keyboard.press("Tab");
  const stops = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => ({ inHeader: Boolean(document.activeElement?.closest("#app-header")), left: document.activeElement?.getBoundingClientRect().left ?? -1 })));
  }
  check("Tab: the 10 header controls come in visual order", stops.every((x, i) => x.inHeader && (i === 0 || x.left > stops[i - 1].left)), JSON.stringify(stops));
  await page.focus('[data-action="info.open"]');
  check("tooltip: shows on keyboard focus", await page.isVisible("#tooltip"));
  await page.keyboard.press("Escape");
  check("tooltip: Esc closes it", !(await page.isVisible("#tooltip")));
  await page.click('[data-action="theme.cycle"]');
  check("theme: the first click goes from auto to light", (await page.getAttribute("html", "data-theme")) === "light");
  await page.click('[data-action="theme.cycle"]');
  await page.click('[data-action="theme.cycle"]');
  check("theme: it cycles back to auto", (await page.getAttribute("html", "data-theme")) === "auto");
  await page.click('[data-action="theme.cycle"]');
  await page.click('[data-action="panel.toggle"]');
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("theme: the choice survives a reload", (await page.getAttribute("html", "data-theme")) === "light");
  check("panel: the folded panel stays folded after a reload", (await page.getAttribute("body", "data-panel")) === "rail");
  await page.click('[data-action="panel.toggle"]');
  await page.click('[data-action="demo.load"]');
  const stored = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
  }));
  const allowed = ["checkir.lang", "checkir.theme", "checkir.panel"];
  check("privacy: only preferences are stored, nothing of the analysis", stored.local.every((k) => allowed.includes(k)) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
  await ctx.close();
}

/** The product name lives only in appname.js: swapping that module changes it everywhere (title, heading, catalog text, manifest id). */
async function nameScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT" });
  await ctx.route("**/appname.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export const APP_NAME = "provanome"; export const APP_ID = "provaid"; export const STORAGE_PREFIX = "provaid.";' }),
  );
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("name: title, heading and footer show APP_NAME", (await page.title()) === "provanome" && (await page.textContent("#app-name")) === "provanome" && /^provanome /.test((await page.textContent(".footer p")) ?? ""));
  check("name: default name absent from the page", !/checkir/i.test(await page.evaluate(() => document.body.innerText + document.title)));
  await ctx.close();
}

async function run() {
  const browser = await { chromium, firefox, webkit }[process.env.BROWSER || "chromium"].launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    for (const scheme of ["light", "dark"]) await schemeScenario(browser, scheme);
    await phoneScenario(browser);
    await nextStepScenario(browser);
    await shellScenario(browser);
    await registryScenario(check);
    await nameScenario(browser);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `${failures} checks failed` : "all checks ok");
  process.exit(failures ? 1 : 0);
}

run();
