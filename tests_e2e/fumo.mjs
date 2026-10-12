// Smoke e2e: the page loads, draws the synthetic spectrum with its table, is keyboard-operable, passes axe
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

let fallimenti = 0;
function controlla(nome, ok, dettaglio = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${nome}${ok ? "" : " " + dettaglio}`);
  if (!ok) fallimenti++;
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
    const errori = [];
    page.on("pageerror", (e) => errori.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errori.push(m.text()));
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
    controlla(`[${scheme}] curva e tabella disegnate`, (await page.locator("#grafico polyline.curva").count()) === 1 && (await page.locator("#tabella tbody tr").count()) > 10);
    controlla(`[${scheme}] versione del motore`, /\d+\.\d+\.\d+/.test(await page.textContent("#versione-motore")));
    const viol = await axe(page);
    controlla(`[${scheme}] axe senza violazioni`, viol.length === 0, viol.join(", "));
    controlla(`[${scheme}] nessun errore in console`, errori.length === 0, errori.join(" | "));
    await ctx.close();
  }

  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  controlla("zoom 400 % (320 px): nessuno scorrimento orizzontale", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  await page.keyboard.press("Tab");
  controlla("Tab: primo elemento è il link «salta»", await page.evaluate(() => document.activeElement?.className === "salta"));
  await page.focus("#grafico");
  const prima = await page.textContent("#intervallo");
  await page.keyboard.press("+");
  const dopo = await page.textContent("#intervallo");
  controlla("tastiera: + riduce l'intervallo", prima !== dopo && dopo.includes("4000") === false, `${prima} -> ${dopo}`);
  await page.keyboard.press("0");
  controlla("tastiera: 0 ripristina la vista intera", (await page.textContent("#intervallo")) === prima);
  controlla("numeri col punto, senza separatore delle migliaia", /da 400 a 4000 cm/.test(prima) && !/[.,]\d{3}\b/.test(prima), prima);

  await page.selectOption("#lingua", "en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  const asse = await page.textContent("#grafico svg text:last-child");
  controlla("cambio lingua in inglese", asse === "Absorbance", asse ?? "");
  controlla("tabella con decimale col punto in inglese", /^\d+\.\d{4}$/.test((await page.locator("#tabella tbody tr:first-child td:nth-child(2)").textContent()) ?? ""));
  const violEn = await axe(page);
  controlla("[en] axe senza violazioni", violEn.length === 0, violEn.join(", "));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(fallimenti ? `${fallimenti} controlli falliti` : "tutti i controlli ok");
process.exit(fallimenti ? 1 : 0);
