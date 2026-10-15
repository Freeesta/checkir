// Sampling e2e: a library that declares how it was measured, the choice in the file row, the cap with its reason, the file that names its own method.
import { ALFA, ALFA_BIS, BETA, GAMMA, jcamp } from "./confronto.mjs";
import { importAs } from "./importa_aiuto.mjs";

async function openPanel(page, name) {
  const section = page.locator(`details[data-panel="${name}"]`);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** Level number of the result shown once it matches `want` (the comparison runs again after each change). */
async function levelIs(page, want) {
  await openPanel(page, "results");
  return page.waitForFunction((w) => document.querySelector(".result[data-level]")?.getAttribute("data-level") === w, want, { timeout: 20000 }).then(() => true, () => false);
}

/** The choice sits in the files section; opening the results closes it, so open it again before each change. */
async function choose(page, code, value) {
  await openPanel(page, "files");
  await page.locator(`[data-fk="sampling-${code}"]`).selectOption(value);
}

export async function samplingScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openPanel(page, "libraries");
  const file = (name, bands) => ({ name, mimeType: "application/octet-stream", buffer: jcamp(name.replace(".jdx", ""), bands) });
  await importAs(page, "Diamante", [file("alfa.jdx", ALFA), file("beta.jdx", BETA), file("gamma.jdx", GAMMA), file("alfa_bis.jdx", ALFA_BIS)]);
  await page.locator('[data-library="diamante"]').waitFor();
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="diamante"]')?.textContent ?? ""));
  // The panel asks nothing, so the library has no method; a ready-made package that declares one is loaded in its place.
  const pack = await page.evaluate(async () => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries")).getDirectoryHandle("diamante");
    const out = [];
    for (const name of ["manifest.json", "index.json", "data.bin", "native.bin"]) {
      const bytes = new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
      out.push({ name, b64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")) });
    }
    return out;
  });
  await page.getByRole("button", { name: /Rimuovi la libreria diamante/ }).click();
  await page.waitForSelector('[data-library="diamante"]', { state: "detached" });
  await page.setInputFiles('input[data-library="files"]', pack.map((f) => {
    const buffer = Buffer.from(f.b64, "base64");
    return { name: f.name, mimeType: "application/octet-stream", buffer: f.name === "manifest.json" ? Buffer.from(JSON.stringify({ ...JSON.parse(buffer.toString()), sampling: "atr_diamond" })) : buffer };
  }));
  await page.locator('[data-library="diamante"]').waitFor();

  await page.setInputFiles("input[type=file]", [file("campione.jdx", BETA)]);
  check("sampling: without a stated method the level is not capped", await levelIs(page, "2"));
  const choice = page.locator('[data-fk="sampling-C1"]');
  await openPanel(page, "files");
  check("sampling: the sample row has the choice, set to not stated", (await choice.inputValue()) === "unknown");
  check("sampling: the choice has an accessible name with the code", /C1/.test((await choice.getAttribute("aria-label")) ?? ""));
  await choose(page, "C1", "transmission_kbr");
  check("sampling: a different method caps the level at T3", await levelIs(page, "3"));
  const cap = (await page.locator(".result .cap").allTextContents()).join(" | ");
  check("sampling: the reason names both methods", /trasmissione KBr/.test(cap) && /ATR diamante/.test(cap), cap);
  check("sampling: the chip of the result shows T3", /T3/.test((await page.textContent('[data-chip="result"]')) ?? ""));
  await choose(page, "C1", "atr_ge");
  check("sampling: another ATR crystal also caps", await levelIs(page, "3"));
  await choose(page, "C1", "atr_diamond");
  check("sampling: the same method gives the level back, with no reason", (await levelIs(page, "2")) && (await page.locator(".result .cap").count()) === 0);
  await choose(page, "C1", "unknown");
  check("sampling: not stated is not a method: no cap", await levelIs(page, "2"));

  // A file that names its own method opens with it set.
  const own = Buffer.from(jcamp("kbr", BETA).toString().replace("##JCAMP-DX=4.24", "##JCAMP-DX=4.24\n##SAMPLING PROCEDURE=KBr pellet"));
  await page.setInputFiles("input[type=file]", [{ name: "kbr.jdx", mimeType: "application/octet-stream", buffer: own }]);
  await openPanel(page, "files");
  check("sampling: the file's own method is read", (await page.locator('[data-fk="sampling-C2"]').inputValue()) === "transmission_kbr");
  check("sampling: and the level follows it", await levelIs(page, "3"));
  check("sampling: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
