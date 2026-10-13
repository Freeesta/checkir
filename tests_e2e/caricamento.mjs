// Loading scenarios: a synthetic JCAMP-DX file is opened from the chooser and by drop, the chart and table show its points,
// the original file name stays in section 1 and the tooltip, a broken file gives a translated error, nothing of the analysis is stored.
import { readFile } from "node:fs/promises";

const FIXTURE = new URL("../crates/ftir-core/tests/fixtures/jcamp/affn_ascending.jdx", import.meta.url);
const SECRET_NAME = "campione_segreto_prova.jdx";

/** Pure checks on the page modules that need no browser. */
async function pureScenario(check) {
  const { thin, parseDocument } = await import(new URL("../web/spectrum.js", import.meta.url));
  const ys = Array.from({ length: 10000 }, (_, i) => (i === 4321 ? 9 : i === 777 ? -5 : 0));
  const idx = Array.from({ length: ys.length }, (_, i) => i);
  const kept = thin(idx, ys, 700);
  check("thin: a long spectrum is reduced to at most two points per bucket", kept.length <= 1400 && kept.length > 700, String(kept.length));
  check("thin: the peak and the valley survive the reduction", kept.includes(4321) && kept.includes(777));
  check("thin: a short spectrum is untouched", thin([0, 1, 2], [1, 2, 3], 700).length === 3);
  const ok = parseDocument(JSON.stringify({ primary: 0, warnings: [], spectra: [{ x: { unit: "Cm1", values: { first: 400, last: 4000, n: 4 } }, y: { unit: "Absorbance", values: [1, 2, 3, 4] }, instrument: { resolution_cm1: 4 }, warnings: [{ key: "w", severity: "Caution", params: { a: "1" } }, { key: "i", severity: "Info", params: {} }] }] }));
  check("parseDocument: regular axis expanded, resolution and cautions kept", "spectrum" in ok && ok.spectrum.wavenumber_cm1.join() === "400,1600,2800,4000" && ok.resolutionCm1 === 4 && ok.notices.length === 1);
  const bad = parseDocument(JSON.stringify({ error: "x", error_key: "reader.jcamp.no_data", params: {} }));
  check("parseDocument: an engine error keeps its key", "error" in bad && bad.error.key === "reader.jcamp.no_data");
  const um = parseDocument(JSON.stringify({ primary: 0, warnings: [], spectra: [{ x: { unit: "Um", values: [1, 2] }, y: { unit: "Absorbance", values: [1, 2] }, instrument: {}, warnings: [] }] }));
  check("parseDocument: an axis that is not cm-1 is refused with a key", "error" in um && um.error.key === "err.file.axis_unit");
  check("parseDocument: text that is not JSON is refused with a key", "error" in parseDocument("nope"));
}

/** @param {import("playwright").Browser} browser @param {string} base */
async function browserScenario(browser, base, check, axe) {
  const jdx = await readFile(FIXTURE);
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("load: before any file the chart says so", (await page.textContent("#chart"))?.includes("Nessuno spettro") === true);
  await page.setInputFiles("input[type=file]", { name: SECRET_NAME, mimeType: "application/octet-stream", buffer: jdx });
  await page.waitForSelector("#chart polyline.curve");
  const rows = await page.locator("#table tbody tr").count();
  check("load: chart and table show the points of the file", rows === 181, String(rows));
  const chip = (await page.textContent('[data-chip="file"]'))?.trim() ?? "";
  check("load: the header says C1 with the range", chip.startsWith("C1") && chip.includes("4000–400"), chip);
  const leaks = await page.evaluate((name) => {
    const hit = [];
    for (const node of document.querySelectorAll("body *")) {
      if (node.closest('[data-panel="files"]')) continue;
      if ((node.childNodes.length && [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(name))) || [...node.attributes].some((a) => a.value.includes(name))) hit.push(node.tagName);
    }
    return hit;
  }, SECRET_NAME);
  check("load: the file name appears only in section 1 (and the tooltip)", leaks.length === 0, leaks.join(","));
  check("load: the file name is in section 1", ((await page.textContent('[data-panel="files"]')) ?? "").includes(SECRET_NAME));
  await page.hover('[data-chip="file"]');
  check("load: the file name is in the header tooltip", ((await page.textContent("#tooltip")) ?? "").includes(SECRET_NAME));
  await page.mouse.move(0, 0);
  const text = await page.evaluate(() => document.documentElement.outerHTML);
  check("canary: values of identity fields never reach the page", !text.includes("checkir tests") && !text.includes("synthetic generator"));

  await page.evaluate(
    ({ bytes, name }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name));
      document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { bytes: [...jdx], name: "secondo.jdx" },
  );
  await page.waitForSelector('[data-fk="sel-C2"]', { state: "attached" });
  await page.evaluate(() => { document.querySelector('details[data-panel="files"]').open = true; });

  check("drop: a dropped file becomes C2 and is active", (await page.textContent('[data-chip="file"]'))?.trim().startsWith("C2") === true);
  await page.click('[data-fk="sel-C1"]');
  check("tree: choosing C1 shows it again", (await page.textContent('[data-chip="file"]'))?.trim().startsWith("C1") === true);

  await page.setInputFiles("input[type=file]", { name: "rotto.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 1, 2, 250, 251]) });
  await page.waitForSelector("#panel .error");
  const errIt = (await page.textContent("#panel .error")) ?? "";
  check("error: a file in no known format gives a translated error (it)", errIt.includes("non riconosciuto"), errIt);
  const bad = await axe(page);
  check("load: axe is clean with files and an error shown", bad.length === 0, bad.join(", "));
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  const errEn = (await page.textContent("#panel .error")) ?? "";
  check("error: the same error is translated into English", errEn.includes("not recognised"), errEn);
  await page.setInputFiles("input[type=file]", { name: "troncato.jdx", mimeType: "application/octet-stream", buffer: jdx.subarray(0, 120) });
  await page.waitForFunction(() => !document.querySelector("#panel .error")?.textContent?.includes("recognised"));
  const trunc = (await page.textContent("#panel .error")) ?? "";
  check("error: a truncated JCAMP file shows a translated message, never a raw key", trunc.length > 0 && !/^\s*(reader|err)\./.test(trunc) && !trunc.includes("reader."), trunc);

  const stored = await page.evaluate(async () => ({ local: Object.keys(localStorage), session: sessionStorage.length, idb: (await indexedDB.databases()).length }));
  check("canary: only preferences are stored with files loaded", stored.local.every((k) => ["checkir.lang", "checkir.theme", "checkir.panel"].includes(k)) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));

  await page.evaluate(() => { document.querySelector('details[data-panel="files"]').open = true; });
  await page.click('[data-fk="close-C1"]');
  await page.click('[data-fk="close-C2"]');
  check("close: closing every file empties chart, table and header", (await page.textContent("#chart"))?.includes("No spectrum") === true && (await page.locator("#table tbody tr").count()) === 0 && (await page.textContent('[data-chip="file"]'))?.trim() === "—");
  check("close: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

export async function loadingScenario(browser, base, check, axe) {
  await pureScenario(check);
  await browserScenario(browser, base, check, axe);
}
export { FIXTURE };
