// Substance tabs e2e: «Scheda completa» opens the sheet as an orange tab next to the files', the same substance is the same tab, files and substances alternate keeping the view of the file,
// the 21st substance is refused, the tabs reorder, nothing leaves the origin or is stored, nothing is restored on reload; axe in light, dark and English, 320 px.
import { readFile } from "node:fs/promises";
import { chipCount } from "./conteggio.mjs";

const SPECTRUM = new URL("../data/substances/synthetic-a/spectra/synthetic-a-base.checkir.001.jdx", import.meta.url);
const st = (page, expr) => page.evaluate(async (e) => new Function("s", `return ${e}`)((await import(new URL("state.js", location.href).href)).getState()), expr);
const focusId = (page) => page.evaluate(() => document.activeElement?.id ?? "");
const open = (page, id, name) => page.evaluate(async ([i, n]) => (await import(new URL("schede_ui.js", location.href).href)).openSheet(i, n), [id, name]);

/** A page with C1 loaded, the demo library on and the results drawn. */
async function withResult(browser, base, locale, scheme, width = 1366) {
  const ctx = await browser.newContext({ colorScheme: scheme, locale, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const seen = { errors: [], foreign: [] };
  page.on("pageerror", (e) => seen.errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  page.on("request", (r) => { if (!r.url().startsWith(new URL(base).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) seen.foreign.push(r.url()); });
  await page.locator('details[data-panel="libraries"] summary').click();
  await page.waitForFunction(() => /1/.test(document.querySelector('[data-library="checkir-demo"]')?.textContent ?? ""), null, { timeout: 20000 });
  await page.getByRole("checkbox", { name: /checkir-demo/ }).check();
  await page.waitForFunction((x) => document.querySelector('[data-chip="library"]')?.textContent?.includes(x), await chipCount(base, { withDemo: true }), { timeout: 20000 });
  await page.setInputFiles("input[type=file]", [{ name: "uno.jdx", mimeType: "chemical/x-jcamp-dx", buffer: await readFile(SPECTRUM) }]);
  const section = page.locator('details[data-panel="results"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
  if (width !== 1366) await page.setViewportSize({ width, height: 700 });
  return { ctx, page, seen };
}

/** From the result to a tab, the same tab twice, files and substances alternating. */
async function flowScenario(browser, base, check, axe) {
  const { ctx, page, seen } = await withResult(browser, base, "it-IT", "light");
  await page.waitForSelector('[data-fk="open-sheet"]');
  await page.click("#tab-C1");
  await page.keyboard.press("p");
  const before = await st(page, "JSON.stringify([s.showPeaks, s.active, s.selected])");
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("#sheet-pane .substance-sheet");
  const tabs = await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => [b.dataset.kind, b.getAttribute("aria-selected")]));
  check("sheet tabs: «Scheda completa» opens a sheet tab next to C1 and gives it the focus", JSON.stringify(tabs) === '[["file","false"],["sheet","true"]]', JSON.stringify(tabs));
  const tab = page.locator('#doc-tabs [data-kind="sheet"]');
  check("sheet tabs: the tab has the sheet icon, the orange rule and the name", (await tab.locator("svg use").getAttribute("href")).endsWith("#sheet") && (await tab.evaluate((b) => getComputedStyle(b).borderTopColor)) !== (await page.locator("#tab-C1").evaluate((b) => getComputedStyle(b).borderTopColor)) && /^Scheda della sostanza /.test((await tab.getAttribute("aria-label")) ?? ""));
  check("sheet tabs: the main pane is hidden, the sheet pane is the panel of the tab, the title has the focus", (await page.isHidden("#pane-main")) && (await page.isVisible("#sheet-pane")) && (await page.getAttribute("#sheet-pane", "aria-labelledby")) === (await tab.getAttribute("id")) && (await focusId(page)) === "sheet-title");
  check("sheet tabs: the sheet has thirteen sections and the link to the sheets page", (await page.locator("#sheet-pane .sheet-section").count()) === 13 && (await page.locator('#sheet-pane a[href^="pagine/schede/#"]').count()) === 1 && (await page.locator("#sheet-pane h2").count()) === 1);
  check("sheet tabs: the state holds only id, name and cuts, the sheet DOM only the pane", (await st(page, "Object.keys(s.tabs[1].sheet).sort().join()")) === "cuts,id,name");
  await page.click("#tab-C1");
  await page.click('[data-fk="open-sheet"]');
  await page.waitForFunction(() => document.activeElement?.id === "sheet-title");
  check("sheet tabs: the second opening is the same tab", (await page.locator("#doc-tabs [role=tab]").count()) === 2 && (await st(page, "s.focusTab")) === (await tab.getAttribute("data-tab")));
  await page.focus("#tab-C1");
  await page.keyboard.press("Enter");
  check("sheet tabs: file and substance alternate with the arrows and Enter, the view of C1 is kept", (await st(page, "s.focusTab")) === "C1" && (await page.isVisible("#pane-main")) && (await page.isHidden("#sheet-pane")) && (await st(page, "JSON.stringify([s.showPeaks, s.active, s.selected])")) === before && (await focusId(page)) === "tab-C1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  check("sheet tabs: → and Enter show the sheet again and the focus stays on the tab", (await page.isVisible("#sheet-pane")) && (await focusId(page)) === (await tab.getAttribute("id")) && (await page.locator("#sheet-pane .sheet-section").count()) === 13);
  await page.keyboard.press("Control+Shift+ArrowLeft");
  check("sheet tabs: Ctrl+Shift+← moves the substance tab before C1", (await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => b.dataset.kind).join())) === "sheet,file");
  await page.keyboard.press("Control+Shift+ArrowRight");
  check("sheet tabs: Ctrl+Shift+→ moves it back", (await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => b.dataset.kind).join())) === "file,sheet");
  const v = await axe(page);
  check("sheet tabs: axe has no violations with a sheet tab (light)", v.length === 0, v.join(", "));
  await page.emulateMedia({ media: "print" });
  const print = await page.evaluate(() => ({ pane: getComputedStyle(document.getElementById("sheet-pane")).display, panel: getComputedStyle(document.getElementById("panel")).display, tabs: getComputedStyle(document.getElementById("doc-tabs")).display, main: getComputedStyle(document.getElementById("pane-main")).display }));
  const pdf = await page.pdf({ format: "A4" }).catch(() => null);
  await page.emulateMedia({ media: "screen" });
  check("sheet tabs: a substance in focus prints alone, as a PDF", print.pane === "block" && print.panel === "none" && print.tabs === "none" && print.main === "none" && pdf !== null && pdf.length > 1000, JSON.stringify(print));
  await page.focus('#doc-tabs [data-kind="sheet"]');
  await page.keyboard.press("Delete");
  check("sheet tabs: Delete closes the substance tab and the file comes back with its view", (await st(page, "s.tabs.length === 1 && s.focusTab === 'C1'")) === true && (await page.isVisible("#pane-main")) && (await page.locator("#chart svg").count()) >= 1);
  const stored = await page.evaluate(async () => ({ local: Object.keys(localStorage), session: sessionStorage.length, idb: (await indexedDB.databases()).length }));
  check("sheet tabs: nothing is stored but preferences", stored.local.every((k) => k.startsWith("checkir.")) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("#sheet-pane .substance-sheet");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("sheet tabs: after a reload there is no tab and no sheet", (await page.locator("#doc-tabs [role=tab]").count()) === 0 && (await page.isHidden("#sheet-pane")) && (await page.locator("#sheet-pane .substance-sheet").count()) === 0);
  check("sheet tabs: no request to another origin and no page errors", seen.foreign.length === 0 && seen.errors.length === 0, [...seen.foreign, ...seen.errors].join(" | "));
  await ctx.close();
}

/** The 21st substance is refused with a notice and an announcement; a sheet the site does not have says so. */
async function limitScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  for (let i = 1; i <= 20; i++) await open(page, `nessuna-${i}`, `Sostanza ${i}`);
  check("sheet tabs limit: twenty substances make twenty tabs", (await page.locator("#doc-tabs [data-kind=sheet]").count()) === 20);
  check("sheet tabs limit: a sheet the site does not have says so", /Nessuna scheda|nessuna scheda|non c'è/i.test((await page.textContent("#sheet-pane")) ?? "") && (await page.locator("#sheet-pane [data-no-sheet]").count()) === 1);
  await open(page, "nessuna-21", "Sostanza 21");
  await page.waitForFunction(() => /20 schede di sostanze/.test(document.getElementById("tabs-notice")?.textContent ?? ""));
  check("sheet tabs limit: the 21st is refused with a notice and an announcement", (await page.locator("#doc-tabs [data-kind=sheet]").count()) === 20 && /20 schede di sostanze/.test((await page.textContent("#status")) ?? ""));
  await open(page, "nessuna-3", "Sostanza 3");
  check("sheet tabs limit: an open substance still comes to the front and clears the notice", (await st(page, "s.focusTab")) === "sheet-nessuna-3" && ((await page.textContent("#tabs-notice")) ?? "") === "");
  await ctx.close();
}

/** Accessibility in dark and English, and the narrow screen. */
async function viewScenario(browser, base, check, axe) {
  for (const [scheme, locale] of [["dark", "it-IT"], ["light", "en-GB"]]) {
    const { ctx, page } = await withResult(browser, base, locale, scheme);
    await page.click('[data-fk="open-sheet"]');
    await page.waitForSelector("#sheet-pane .substance-sheet");
    const v = await axe(page);
    check(`sheet tabs: axe has no violations (${scheme}, ${locale})`, v.length === 0, v.join(", "));
    if (locale === "en-GB") check("sheet tabs: the English names", /^Substance sheet /.test((await page.getAttribute('#doc-tabs [data-kind="sheet"]', "aria-label")) ?? ""));
    await ctx.close();
  }
  const { ctx, page } = await withResult(browser, base, "it-IT", "light", 320);
  await page.click('[data-fk="open-sheet"]');
  await page.waitForSelector("#sheet-pane .substance-sheet");
  check("sheet tabs: at 320 px nothing scrolls sideways", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById("sheet-pane").scrollWidth <= document.getElementById("sheet-pane").clientWidth + 1));
  await ctx.close();
}

export async function tabsSheetsScenario(browser, base, check, axe) {
  await flowScenario(browser, base, check, axe);
  await limitScenario(browser, base, check);
  await viewScenario(browser, base, check, axe);
}
