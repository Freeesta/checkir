// Privacy e2e (rules R1, R2, R4, R5): T1 static CSP/URL check and T2 "canary".
// T2 loads a synthetic file whose metadata are canaries, does everything the page can do, then checks that
// (a) no request left the site origin and no CSP violation happened, (b) no canary is in localStorage, sessionStorage,
// IndexedDB, OPFS, Cache Storage, cookies, the page or any downloaded file, (c) after a reload nothing of the sample is left.
// RULE: every new action or export of the page is added to `doEverything` (docs/agenti/riservatezza.md).
import { chromium, firefox, webkit } from "playwright";
import { FAKE_PICKER } from "./cartella.mjs";
import { CANARIES, CANARY_STRINGS, canaryJcamp } from "./canarino.mjs";
import { subtractionTrace } from "./sottrazione.mjs";
import { staticScenario } from "./riservatezza_statico.mjs";
import { startSite } from "./sito.mjs";

const { base, close } = await startSite();
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + detail}`);
  if (!ok) failures++;
}

/** Everything the browser keeps for the page, as one string (the code runs inside the page). */
async function storageDump(page, ctx) {
  const inPage = await page.evaluate(async () => {
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const text = (v) => { try { return JSON.stringify(v, (k, x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? new TextDecoder().decode(x) : x)); } catch { return String(v); } };
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      for (const store of db.objectStoreNames) {
        parts.push(store, await new Promise((ok) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => ok(text(r.result)); r.onerror = () => ok(""); }));
      }
      db.close();
    }
    const walk = async (dir) => {
      let out = "";
      for await (const [n, h] of dir.entries()) out += n + "\n" + (h.kind === "file" ? await (await h.getFile()).text() : await walk(h));
      return out;
    };
    parts.push(await walk(await navigator.storage.getDirectory()));
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) parts.push(req.url, await (await cache.match(req)).clone().text());
    }
    return parts.join("\n");
  });
  return inPage + "\n" + JSON.stringify(await ctx.cookies());
}

/** The canary strings found in `text` (case-insensitive). */
export function canariesIn(text) {
  const low = text.toLowerCase();
  return CANARY_STRINGS.filter((c) => low.includes(c.toLowerCase()));
}

/** A browser context that records every request and every CSP violation. */
async function watchedContext(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const seen = { requests: [], violations: [], downloads: [] };
  ctx.on("request", (r) => seen.requests.push(r.url()));
  ctx.on("page", (p) => {
    p.on("console", (m) => /Content Security Policy/i.test(m.text()) && seen.violations.push(m.text()));
    p.on("download", async (d) => { const path = await d.path(); if (path) seen.downloads.push(await (await import("node:fs/promises")).readFile(path, "utf8").catch(() => "")); });
  });
  return { ctx, seen };
}

/** Requests that do not go to the site itself. */
export function foreignRequests(urls) {
  return urls.filter((u) => !u.startsWith(base) && !/^(data|blob|about):/.test(u));
}

/** Clicks every enabled action once (the file chooser gets the canary file), switches language and theme, zooms. */
async function doEverything(page) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click('#workbar [data-action="file.open"]')]);
  await chooser.setFiles({ name: CANARIES.fileName, mimeType: "chemical/x-jcamp-dx", buffer: Buffer.from(canaryJcamp(), "latin1") });
  await page.click('[data-action="demo.load"]');
  const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-action]")].map((e) => e.getAttribute("data-action")))]);
  for (const id of ids) {
    if (id === "file.open" || id === "demo.load") continue;
    const button = page.locator(`[data-action="${id}"]:visible:enabled`).first();
    if (await button.count()) {
      await button.click({ timeout: 2000 }).catch(() => {});
      await page.keyboard.press("Escape");
    }
  }
  for (const lang of ["en", "it"]) {
    await page.click("#lang-button");
    await page.click(`[data-lang="${lang}"]`);
    await page.waitForFunction((l) => document.body.dataset.langReady === l, lang);
  }
  await page.focus("#chart");
  for (const key of ["+", "ArrowLeft", "0"]) await page.keyboard.press(key);
  for (const slug of ["informativa"]) {
    await page.keyboard.press("i");
    await page.locator("dialog .footer-links a").nth(0).click();
    await page.waitForSelector("body[data-page][data-ready='1']");
    for (const l of ["en", "it"]) {
      await page.click("#lang-button", { timeout: 5000 });
      await page.locator(`[data-lang="${l}"]`).click({ timeout: 5000 });
      await page.waitForFunction((x) => document.body.dataset.langReady === x, l);
    }
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
  }
  // Comparison region: key g, the numeric fields, the cursors as a brush, the strip under the axis, clear; the choice is in memory only.
  await page.evaluate(() => document.querySelector('[data-action="demo.load"]')?.click());
  await page.keyboard.press("g");
  if ((await page.getAttribute("body", "data-panel")) === "rail") await page.click('[data-action="panel.toggle"]');
  await page.evaluate(() => { document.querySelector('details[data-panel="results"]').open = true; });
  await page.fill('[data-fk="range-new-from"]', "650");
  await page.keyboard.press("Tab");
  await page.fill('[data-fk="range-new-to"]', "1800");
  await page.keyboard.press("Tab");
  await page.click('[data-fk="range-add"]');
  await page.focus("#chart");
  for (const key of ["k", "k", ">", ">"]) await page.keyboard.press(key);
  await page.click('[data-fk="range-cursors"]');
  const strip = await page.locator("#chart .brush-strip").boundingBox();
  if (strip) {
    await page.mouse.move(strip.x + strip.width * 0.2, strip.y + 5);
    await page.mouse.down();
    await page.mouse.move(strip.x + strip.width * 0.6, strip.y + 5, { steps: 4 });
    await page.mouse.up();
  }
  await page.click('[data-fk="range-clear"]');
  await page.waitForSelector(".result[data-level]", { timeout: 20000 }); // a new result moves the panel to section 3: open section 1 after it
  await page.evaluate(() => { document.querySelector('details[data-panel="files"]').open = true; });
  // Watched folder (stand-in picker): choose, remember, open-at-once, stop; at the end nothing is remembered.
  if ((await page.getAttribute("body", "data-panel")) === "rail") await page.click('[data-action="panel.toggle"]');
  await page.click("#folder-choose");
  await page.check("#folder-remember");
  await page.check("#folder-auto");
  await page.uncheck("#folder-remember"); // the switches exist only while a folder is watched or remembered
  await page.click("#folder-stop");
  await page.evaluate(() => navigator.serviceWorker?.ready);
}

async function canaryScenario(browser) {
  const { ctx, seen } = await watchedContext(browser);
  await ctx.addInitScript(FAKE_PICKER);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await doEverything(page);
  await subtractionTrace(page, CANARIES.fileName);
  const dump = await storageDump(page, ctx);
  // While a file is open the page shows it to its owner; closing every file must leave nothing of it in the page.
  for (let i = 0; i < 20; i++) {
    const closed = await page.evaluate(() => { const b = document.querySelector('[data-action="file.close"]:not([disabled])'); if (b instanceof HTMLElement) b.click(); return !!b; });
    if (!closed) break;
  }
  const dom = await page.evaluate(() => document.documentElement.outerHTML);
  check("T2 (a): no request to another origin", foreignRequests(seen.requests).length === 0, foreignRequests(seen.requests).join(", "));
  check("T2 (a): no CSP violation", seen.violations.length === 0, seen.violations.join(" | "));
  check("T2 (b): no canary in browser storage, caches, cookies", canariesIn(dump).length === 0, canariesIn(dump).join(", "));
  check("T2 (b): no canary left in the page after closing the files", canariesIn(dom).length === 0, canariesIn(dom).join(", "));
  check("T2 (c): no canary in downloaded files", seen.downloads.every((t) => canariesIn(t).length === 0), String(seen.downloads.length));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  const after = (await storageDump(page, ctx)) + (await page.evaluate(() => document.documentElement.outerHTML));
  check("T2 (d): after a reload nothing of the sample is left", canariesIn(after).length === 0, canariesIn(after).join(", "));
  check("T2 (d): only preferences in localStorage", await page.evaluate(() => Object.keys(localStorage).every((k) => /^checkir\.(lang|theme|panel|shortcuts|autoMatch)$/.test(k))));
  await ctx.close();
}

/** Importing a private library keeps only the spectrum and the file name: the metadata of the file never reach OPFS, the caches or the network. */
async function libraryImportScenario(browser) {
  const { ctx, seen } = await watchedContext(browser);
  const page = await ctx.newPage();
  const own = [];
  page.on("request", (r) => ["fetch", "xhr", "websocket", "eventsource", "ping"].includes(r.resourceType()) && own.push(r.url()));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.locator('[data-library="checkir-demo"]').waitFor();
  // Start-up loads the engine twice by itself (page, then the comparison worker once the first library is synced): the second load is not the import's.
  for (let t = 0; t < 400 && own.filter((u) => u.endsWith("ftir_wasm_bg.wasm")).length < 2; t++) await page.waitForTimeout(50);
  const start = own.length;
  await page.setInputFiles('input[data-library="files"]', { name: "riferimento.jdx", mimeType: "chemical/x-jcamp-dx", buffer: Buffer.from(canaryJcamp(), "latin1") });
  await page.locator('[data-library="riferimento"]').waitFor();
  await page.locator('details[data-panel="libraries"] .notes').waitFor();
  const dump = await storageDump(page, ctx);
  check("T2 (library): the import made no request from the page", own.length === start, own.slice(start).join(", "));
  check("T2 (library): nothing left for another origin", foreignRequests(seen.requests).length === 0);
  check("T2 (library): the private library is in OPFS", dump.includes("checkir-libraries") && dump.includes("riferimento"));
  check("T2 (library): no canary of the file metadata in browser storage after the import", canariesIn(dump).length === 0, canariesIn(dump).join(", "));
  check("T2 (library): no canary in the page after the import", canariesIn(await page.evaluate(() => document.documentElement.outerHTML)).length === 0);
  await ctx.close();
}

/** Controls: the detectors must be able to fail, otherwise a green T2 means nothing. */
async function detectorScenario(browser) {
  const { ctx, seen } = await watchedContext(browser);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => fetch("https://example.org/canary").catch(() => {}));
  await page.waitForTimeout(300);
  check("T2 control: a fetch to another origin is detected", foreignRequests(seen.requests).length > 0 || seen.violations.length > 0);
  await page.evaluate(async (c) => {
    localStorage.setItem("x", c);
    const h = await (await navigator.storage.getDirectory()).getFileHandle("x.txt", { create: true });
    const w = await h.createWritable();
    await w.write(c);
    await w.close();
  }, CANARIES.operator);
  const dump = await storageDump(page, ctx);
  check("T2 control: a canary in localStorage or OPFS is detected", canariesIn(dump).length > 0);
  await ctx.close();
}

async function run() {
  await staticScenario(check);
  const browser = await { chromium, firefox, webkit }[process.env.BROWSER || "chromium"].launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    await detectorScenario(browser);
    await canaryScenario(browser);
    await libraryImportScenario(browser);
  } finally {
    await browser.close();
    close();
  }
  console.log(failures ? `${failures} checks failed` : "all checks ok");
  process.exit(failures ? 1 : 0);
}

run();
