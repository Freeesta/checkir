// Shimadzu library import: the .L01 chosen with its .nam and .IDX (picker) or dropped becomes one private library, the entry names come from the .nam,
// the scale warning is translated, nothing leaves the browser. The files are synthetic, written by the engine's generator at test time.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importAs, removeLibrary } from "./importa_aiuto.mjs";

async function synthetic() {
  const dir = await mkdtemp(join(tmpdir(), "checkir-shimadzu-"));
  execFileSync("cargo", ["run", "--locked", "--release", "-q", "-p", "ftir-core", "--example", "gen_shimadzu_lib", "--", dir, "3"], { stdio: "inherit" });
  const read = async (name) => ({ name, mimeType: "application/octet-stream", buffer: await readFile(join(dir, name)) });
  return { dir, files: [await read("Sintetica.L01"), await read("Sintetica.nam"), await read("Sintetica.IDX")] };
}

/** Pure checks: how the chosen files are grouped. */
export async function shimadzuPureScenario(check) {
  const { unitsOf } = await import(new URL("../web/importa.js", import.meta.url));
  const f = (name) => new File(["x"], name);
  const u = unitsOf([f("A.L01"), f("A.nam"), f("A.IDX"), f("b.jdx")]);
  check("shimadzu: .L01 with its .nam is one unit, the .IDX is not read, other files stay alone", u.length === 2 && u[0].file.name === "A.L01" && u[0].nam?.name === "A.nam" && u[1].file.name === "b.jdx");
  const two = unitsOf([f("x.l01"), f("y.NAM"), f("z.l01"), f("z.nam")]);
  check("shimadzu: the .nam of the same name is chosen, a lone .nam is used only when it is the only pair", two[0].nam === undefined && two[1].nam?.name === "z.nam");
  check("shimadzu: without a .L01 the .nam and .IDX are ordinary files", unitsOf([f("a.nam"), f("a.idx")]).length === 2);
}

export async function shimadzuScenario(browser, base, check, axe) {
  const { dir, files } = await synthetic();
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => ["fetch", "xhr", "websocket", "eventsource", "ping"].includes(r.resourceType()) && requests.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const section = page.locator('details[data-panel="libraries"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
  const before = requests.length;
  await importAs(page, "Shim", files);
  const lib = page.locator('[data-library="shim"]');
  await lib.waitFor();
  const notes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("shimadzu: the library is imported with its 3 entries and the scale warning is translated", /3 spettri/.test(notes) && /normalizzato a 0–255 \(3 voci\)/.test(notes) && !/reader\./.test(notes), notes);
  check("shimadzu: the library is private with 3 spectra", /importata da te/.test((await lib.textContent()) ?? "") && /Spettri: 3/.test((await lib.textContent()) ?? ""));
  const stored = await page.evaluate(async () => {
    const dirHandle = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries")).getDirectoryHandle("shim");
    const get = async (n) => (await dirHandle.getFileHandle(n)).getFile();
    return { size: (await get("data.bin")).size, index: await (await get("index.json")).text() };
  });
  check("shimadzu: data.bin holds 3 spectra on the library grid", stored.size === 3 * 1576 * 4, String(stored.size));
  check("shimadzu: the entry names come from the .nam file", ["Substance 1", "Substance 2", "Substance 3"].every((n) => stored.index.includes(n)));
  check("shimadzu: no network request during the import", requests.length === before, requests.slice(before).join(", "));
  const violations = await axe(page);
  check("shimadzu: axe has no violations with the imported library", violations.length === 0, violations.join(", "));
  await removeLibrary(page, "shim");
  await page.waitForSelector('[data-library="shim"]', { state: "detached" });

  const data = files.map((f) => ({ name: f.name, b64: f.buffer.toString("base64") }));
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name));
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, data);
  await page.locator('[data-library="sintetica"]').waitFor();
  check("shimadzu: dropped on the page the files become a private library (named after the file), not a sample", (await page.locator('[data-fk^="file-"]').count()) === 0);
  check("shimadzu: no page error", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
}
