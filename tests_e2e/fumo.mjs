// Smoke e2e: the page loads, draws the synthetic spectrum with its table, is keyboard-operable, paxisTexts axe
// (light and dark), fits a 320 px viewport (zoom 400 %), and numbers use the decimal point in both languages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const SITE = new URL("../site/", import.meta.url).pathname;
const TIPI = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm" };
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const scheme of ["light", "dark"]) {
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
    check(`[${scheme}] no console errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

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
  check("tastiera: + riduce l'range", before !== after && after.includes("4000") === false, `${before} -> ${after}`);
  await page.keyboard.press("0");
  check("tastiera: 0 ripristina la view full", (await page.textContent("#range")) === before);
  check("numbers use the decimal point, no thousands separator", /da 400 a 4000 cm/.test(before) && !/[.,]\d{3}\b/.test(before), before);

  await page.selectOption("#language", "en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const axis = await page.textContent("#chart svg text:last-child");
  check("cambio language in inglese", axis === "Absorbance", axis ?? "");
  check("table con decimale col punto in inglese", /^\d+\.\d{4}$/.test((await page.locator("#table tbody tr:first-child td:nth-child(2)").textContent()) ?? ""));
  const violationsEn = await axe(page);
  check("[en] axe has no violations", violationsEn.length === 0, violationsEn.join(", "));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} checks failed` : "all checks ok");
process.exit(failures ? 1 : 0);
