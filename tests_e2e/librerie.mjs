// Library scenarios: the public package is listed with licence and attribution and has a switch, it is still there offline,
// a private library is imported from files with progress and zero network requests, kept in OPFS across a reload and removed
// on request; the name index finds compounds by prefix without accents.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE } from "./caricamento.mjs";

/** Pure checks (no browser): the name index and the helpers of the importer. */
export async function librariesPureScenario(check) {
  const { buildNameIndex, searchNames, normalize } = await import(new URL("../web/nomi.js", import.meta.url));
  const { slug, uniqueId } = await import(new URL("../web/importa.js", import.meta.url));
  check("names: accents and case are ignored", normalize("  Ëtere  DI Èdipo ") === "etere di edipo");
  const rows = [
    { id: "a1", substance: "cocaine", names: { it: "Cocaina", en: "Cocaine" }, classes: ["stimulant"], inchikey: "ZPUCINDJVBIVPJ-LJISPDSOSA-N" },
    { id: "a2", substance: "cocaine", names: { en: "Cocaine" }, classes: ["stimulant"] },
    { id: "b1", substance: "codeine", names: { it: "Codeïna", en: "Codeine" }, classes: ["opioid"] },
  ];
  const index = buildNameIndex([{ id: "lib", rows }]);
  const hits = searchNames(index, "CO");
  check("names: prefix search finds each substance once", hits.map((h) => h.substance).join() === "cocaine,codeine", hits.map((h) => h.name).join());
  check("names: an accented name is found without the accent", searchNames(index, "codeina").length === 1);
  check("names: the InChIKey is searchable and the limit is respected", searchNames(index, "zpucind").length === 1 && searchNames(index, "co", 1).length === 1);
  check("names: an empty or unknown query finds nothing", searchNames(index, " ").length === 0 && searchNames(index, "xyz").length === 0);
  check("import: names become safe ids and ids stay unique", slug("Mia Libreria Èè!") === "mia-libreria-ee" && slug("***") === "library" && uniqueId("x", new Set(["x", "x-2"])) === "x-3");
  const { buildPrivateLibrary } = await import(new URL("../web/importa.js", import.meta.url));
  const aborted = new AbortController();
  aborted.abort();
  const never = { library_resample: () => { throw new Error("must not be called"); } };
  const out = await buildPrivateLibrary(never, [new File(["x"], "a.jdx")], { id: "x", name: "x", date: "2026-10-13", attribution: { it: "", en: "x" } }, { signal: aborted.signal, onProgress: () => {} });
  check("import: a cancelled import stops before reading anything and builds nothing", out.cancelled && out.built === null && out.imported === 0);
}

async function openLibraries(page) {
  const section = page.locator('details[data-panel="libraries"]');
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** A folder with a JCAMP, a CSV, a synthetic .ispd and a foreign file: three rows and "1 file non riconosciuto". */
async function folderScenario(page, jdx, check) {
  const ispd = await readFile(new URL("../crates/ftir-core/tests/fixtures/ispd/measurement.ispd", import.meta.url));
  const csv = ["wavenumber,absorbance", ...Array.from({ length: 400 }, (_, i) => `${800 + i * 6},${(0.5 + 0.4 * Math.sin(i / 9)).toFixed(4)}`)].join("\n");
  const dir = await mkdtemp(join(tmpdir(), "checkir-folder-"));
  await writeFile(join(dir, "a.jdx"), jdx);
  await writeFile(join(dir, "b.csv"), csv);
  await writeFile(join(dir, "c.ispd"), ispd);
  await writeFile(join(dir, "d.bin"), Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]));
  await page.fill("#lib-name", "Cartella");
  await page.setInputFiles('input[data-library="folder"]', dir);
  await page.locator('[data-library="cartella"]').waitFor();
  const folderNotes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("import: a folder of JCAMP, CSV and .ispd gives 3 spectra and counts 1 unrecognized file", /3 spettri, 0 scartati/.test(folderNotes) && /1 file non riconosciuto/.test(folderNotes), folderNotes);
  await rm(dir, { recursive: true, force: true });
  await page.getByRole("button", { name: /Rimuovi la libreria cartella/ }).click();
  await page.waitForSelector('[data-library="cartella"]', { state: "detached" });
}

/** @param {import("playwright").Browser} browser */
export async function librariesScenario(browser, base, check, axe) {
  const jdx = await readFile(FIXTURE);
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => ["fetch", "xhr", "websocket", "eventsource", "ping"].includes(r.resourceType()) && requests.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  const pub = page.locator('[data-library="checkir-community"]');
  await pub.waitFor();
  const text = (await pub.textContent()) ?? "";
  check("libraries: the public library shows version, spectra, licence and attribution", /Versione/.test(text) && /Spettri: 1/.test(text) && /CC-BY-4\.0/.test(text) && /Attribuzione: Libreria comunitaria/.test(text) && /Pubblica/.test(text), text);
  check("libraries: the header counts the active libraries", ((await page.textContent('[data-chip="library"]')) ?? "").includes("2 · 12"));
  const swg = (await page.locator('[data-library="swgdrug-ir"]').textContent()) ?? "";
  check("libraries: a library under a written permission shows its citation, licence terms, disclaimer and no endorsement", /SWGDRUG IR Library v2024-05-15/.test(swg) && /LicenseRef-permission-swgdrug/.test(swg) && /Condizioni della licenza: Solo uso non commerciale/.test(swg) && /without warranty or liability/.test(swg) && /SWGDRUG does not endorse \S+ or any software/.test(swg) && !swg.includes("{app}"), swg);
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  check("libraries: switching a library off empties the header chip", ((await page.textContent('[data-chip="library"]')) ?? "").includes("—"));
  await page.getByRole("checkbox", { name: /checkir-community/ }).check();
  const violations = await axe(page);
  check("libraries: axe has no violations with the panel open", violations.length === 0, violations.join(", "));

  const before = requests.length;
  await page.fill("#lib-name", "Mia Libreria");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "uno.jdx", mimeType: "application/octet-stream", buffer: jdx },
    { name: "due.JDX", mimeType: "application/octet-stream", buffer: jdx },
    { name: "rotto.jdx", mimeType: "application/octet-stream", buffer: Buffer.from("non e' uno spettro") },
    { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("ignorato") },
  ]);
  const mine = page.locator('[data-library="mia-libreria"]');
  await mine.waitFor();
  await page.locator('details[data-panel="libraries"] .notes').waitFor();
  const notes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("import: the summary counts imported files and the unrecognized ones (broken JCAMP, text note)", /2 spettri, 0 scartati/.test(notes) && /2 file non riconosciuti/.test(notes), notes);
  check("import: the private library is marked private with personal-use licence", /Privata/.test((await mine.textContent()) ?? "") && /uso personale/.test((await mine.textContent()) ?? ""));
  check("import: no network request during the import", requests.length === before, requests.slice(before).join(", "));
  const stored = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries");
    const dir = await root.getDirectoryHandle("mia-libreria");
    return (await (await dir.getFileHandle("data.bin")).getFile()).size;
  });
  check("import: data.bin in OPFS has two spectra on the 1576-point grid", stored === 2 * 1576 * 4, String(stored));

  await folderScenario(page, jdx, check);
  const withPrivate = await axe(page);
  check("import: axe has no violations with a private library", withPrivate.length === 0, withPrivate.join(", "));

  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="mia-libreria"]').waitFor();
  check("import: the private library is still there after a reload", true);
  check("import: only preferences are kept in localStorage", await page.evaluate(() => Object.keys(localStorage).every((k) => /^checkir\.(lang|theme|panel|shortcuts|autoMatch)$/.test(k))));
  await page.getByRole("button", { name: /Rimuovi la libreria mia-libreria/ }).click();
  await page.waitForSelector('[data-library="mia-libreria"]', { state: "detached" });
  const left = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries", { create: true });
    const names = [];
    for await (const [n] of root.entries()) names.push(n);
    return names;
  });
  check("import: removing a private library deletes it from OPFS", left.length === 0, left.join());
  check("libraries: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** After the first visit the community library is available with no network at all. */
export async function offlineScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    for (const k of await caches.keys()) if (await (await caches.open(k)).match("librerie/checkir-community/data.bin")) return true;
    return false;
  });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="checkir-community"]').waitFor();
  check("offline: the community library is available without network after the first visit", true);
  await ctx.close();
}
