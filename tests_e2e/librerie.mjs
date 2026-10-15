// Library scenarios: the public package is listed with licence and attribution and has a switch, it is still there offline,
// a private library is imported from files with progress and zero network requests, kept in OPFS across a reload and removed
// on request; the name index finds compounds by prefix without accents.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE } from "./caricamento.mjs";
import { importAs } from "./importa_aiuto.mjs";

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
  const { groupPackages } = await import(new URL("../web/importa.js", import.meta.url));
  const f = (name, path) => Object.defineProperty(new File(["x"], name), "webkitRelativePath", { value: path ?? "" });
  const groups = groupPackages([f("manifest.json", "p/a/manifest.json"), f("index.json", "p/a/index.json"), f("data.bin", "p/a/data.bin"), f("native.bin", "p/a/native.bin"), f("manifest.json", "p/b/manifest.json"), f("notes.txt", "p/b/notes.txt")]);
  check("packages: files are grouped by folder and foreign files ignored", groups.length === 2 && groups[0].name === "a" && Boolean(groups[0].native) && groups[1].name === "b" && !groups[1].data);
  const { isMeasure } = await import(new URL("../web/cartella.js", import.meta.url));
  check("folder: the watched folder lists every reader's extension (JCAMP, .ispd, OPUS .0, SPA, SPC, CSV) and nothing else", ["a.JDX", "b.ispd", "c.0", "c.12", "d.SPA", "e.spc", "f.csv"].every(isMeasure) && !["g.pdf", "h.png", "notes"].some(isMeasure));
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
  const root = await mkdtemp(join(tmpdir(), "checkir-folder-"));
  const dir = join(root, "Cartella");
  await mkdir(dir);
  await writeFile(join(dir, "a.jdx"), jdx);
  await writeFile(join(dir, "b.csv"), csv);
  await writeFile(join(dir, "c.ispd"), ispd);
  await writeFile(join(dir, "d.bin"), Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]));
  await page.setInputFiles('input[data-library="folder"]', dir);
  await page.locator('[data-library="cartella"]').waitFor();
  const folderNotes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("import: a folder of JCAMP, CSV and .ispd gives 3 spectra and counts 1 unrecognized file", /3 spettri, 0 scartati/.test(folderNotes) && /1 file non riconosciuto/.test(folderNotes), folderNotes);
  await rm(root, { recursive: true, force: true });
  await page.getByRole("button", { name: /Rimuovi la libreria cartella/ }).click();
  await page.waitForSelector('[data-library="cartella"]', { state: "detached" });
}

/** Ready-made package: the four files of the stored library are loaded again as one package (no folder name: the manifest names it); off survives a reload. */
async function packageScenario(page, check) {
  const files = await page.evaluate(async () => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries")).getDirectoryHandle("mia-libreria");
    const out = [];
    for (const name of ["manifest.json", "index.json", "data.bin", "native.bin"]) {
      const bytes = new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
      out.push({ name, b64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")) });
    }
    return out;
  });
  await page.getByRole("button", { name: /Rimuovi la libreria mia-libreria/ }).click();
  await page.waitForSelector('[data-library="mia-libreria"]', { state: "detached" });
  await page.setInputFiles('input[data-library="files"]', files.map((f) => ({ name: f.name, mimeType: "application/octet-stream", buffer: Buffer.from(f.b64, "base64") })));
  await page.locator('[data-library="mia-libreria"]').waitFor();
  const notes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("package: one ready-made private package is loaded and announced", /Pacchetti privati caricati: 1/.test(notes), notes);
  await page.getByRole("checkbox", { name: /mia-libreria/ }).uncheck();
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="mia-libreria"]').waitFor();
  check("package: it is kept across a reload and stays switched off", !(await page.getByRole("checkbox", { name: /mia-libreria/ }).isChecked()));
  check("package: the switch of a private library is remembered as libsw.<id> = 0", (await page.evaluate(() => localStorage.getItem("checkir.libsw.mia-libreria"))) === "0" && (await page.evaluate(() => localStorage.getItem("checkir.liboff.mia-libreria"))) === null);
  await page.getByRole("checkbox", { name: /mia-libreria/ }).check();
  await page.setInputFiles('input[data-library="files"]', [{ name: "manifest.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"ftir-library/1"}') }]);
  await page.waitForFunction(() => /mancano file/.test(document.querySelector('details[data-panel="libraries"] .notes')?.textContent ?? ""));
  check("package: an incomplete set is refused with a message", true);
  await page.setInputFiles('input[data-library="files"]', [{ name: "manifest.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"altro/1"}') }]);
  await page.waitForFunction(() => /non c'è nessuno spettro/.test(document.querySelector('details[data-panel="libraries"] .notes')?.textContent ?? ""));
  check("package: a manifest.json of another schema is not a package, so the files are read as spectra", true);
  // A folder holding a package and a foreign file: the package is loaded and the foreign file is counted.
  await page.getByRole("button", { name: /Rimuovi la libreria mia-libreria/ }).click();
  await page.waitForSelector('[data-library="mia-libreria"]', { state: "detached" });
  const root = await mkdtemp(join(tmpdir(), "checkir-pack-"));
  const pack = join(root, "pacchetti", "mia-libreria");
  await mkdir(pack, { recursive: true });
  for (const f of files) await writeFile(join(pack, f.name), Buffer.from(f.b64, "base64"));
  await writeFile(join(pack, "note.txt"), "x");
  await page.setInputFiles('input[data-library="folder"]', join(root, "pacchetti"));
  await page.locator('[data-library="mia-libreria"]').waitFor();
  const folderNotes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("package: a folder of packages is recognized from its content; the foreign file is counted", /Pacchetti privati caricati: 1/.test(folderNotes) && /1 file non riconosciuto/.test(folderNotes), folderNotes);
  await rm(root, { recursive: true, force: true });
}

/** The list shows only names; the information is in the tooltip (mouse and keyboard focus) and in the description of the switch. */
async function listChecks(page, check) {
  const visible = (sel) => page.locator(sel).evaluate((li) => { const c = li.cloneNode(true); c.querySelectorAll(".visually-hidden").forEach((n) => n.remove()); return c.textContent.trim(); });
  check("libraries: the list shows only the name", (await visible('[data-library="checkir-demo"]')) === "checkir-demo", await visible('[data-library="checkir-demo"]'));
  check("libraries: exactly two import buttons (library, folder) and two choosers", (await page.locator('details[data-panel="libraries"] button.btn').count()) === 2 && (await page.locator('input[data-library="files"], input[data-library="folder"]').count()) === 2 && (await page.locator("input[data-library=package], input[data-library=packages], #lib-name, #lib-sampling").count()) === 0);
  const tip = page.locator("#tooltip");
  await page.hover('[data-library="checkir-demo"] strong');
  await tip.waitFor({ state: "visible" });
  check("libraries: hovering the name shows version, spectra and licence", /Versione/.test((await tip.textContent()) ?? "") && /Spettri: 1/.test((await tip.textContent()) ?? "") && /Licenza: CC-BY-4\.0/.test((await tip.textContent()) ?? ""));
  await page.mouse.move(0, 0);
  await tip.waitFor({ state: "hidden" });
  await page.focus('[data-fk="lib-on-checkir-demo"]');
  await tip.waitFor({ state: "visible" });
  check("libraries: keyboard focus on the switch shows the same description", /Versione/.test((await tip.textContent()) ?? "") && /Licenza/.test((await tip.textContent()) ?? ""));
  await page.locator('[data-fk="lib-on-checkir-demo"]').blur();
  await page.waitForFunction(() => document.querySelector('[data-fk="lib-on-checkir-demo"]')?.getAttribute("aria-describedby") === "lib-info-checkir-demo");
  check("libraries: the switch keeps its permanent description (aria-describedby)", (await page.locator("#lib-info-checkir-demo").textContent())?.includes("Versione") === true);
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
  const pub = page.locator('[data-library="checkir-demo"]');
  await pub.waitFor();
  const text = (await pub.textContent()) ?? "";
  check("libraries: the public library carries version, spectra, licence and attribution in its description", /Versione/.test(text) && /Spettri: 1/.test(text) && /CC-BY-4\.0/.test(text) && /Attribuzione: Libreria comunitaria/.test(text), text);
  await listChecks(page, check);
  check("libraries: the header counts the active libraries", ((await page.textContent('[data-chip="library"]')) ?? "").includes("1 · 11"));
  const swg = (await page.locator('[data-library="swgdrug-ir"]').textContent()) ?? "";
  check("libraries: a library under a written permission describes its citation, licence terms, disclaimer and no endorsement", /SWGDRUG IR Library v2024-05-15/.test(swg) && /LicenseRef-permission-swgdrug/.test(swg) && /Condizioni della licenza: Solo uso non commerciale/.test(swg) && /without warranty or liability/.test(swg) && /SWGDRUG does not endorse \S+ or any software/.test(swg) && !swg.includes("{app}"), swg);
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  check("libraries: switching a library off empties the header chip", ((await page.textContent('[data-chip="library"]')) ?? "").includes("—"));
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).check();
  const violations = await axe(page);
  check("libraries: axe has no violations with the panel open", violations.length === 0, violations.join(", "));

  const before = requests.length;
  await importAs(page, "Mia Libreria", [
    { name: "uno.jdx", mimeType: "application/octet-stream", buffer: jdx },
    { name: "due.JDX", mimeType: "application/octet-stream", buffer: jdx },
    { name: "rotto.jdx", mimeType: "application/octet-stream", buffer: Buffer.from("non e' uno spettro") },
    { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("ignorato") },
  ]);
  const mine = page.locator('[data-library="mia-libreria"]');
  await mine.waitFor();
  await page.locator('details[data-panel="libraries"] .notes').waitFor();
  const notes = (await page.textContent('details[data-panel="libraries"] .notes')) ?? "";
  check("import: the summary counts imported files and the unrecognized ones (broken JCAMP, text note); the repeated file counts as discarded", /1 spettri, 1 scartati/.test(notes) && /2 file non riconosciuti/.test(notes), notes);
  check("import: the private library says it was imported by you, with personal-use licence", /importata da te/.test((await mine.textContent()) ?? "") && /uso personale/.test((await mine.textContent()) ?? ""));
  check("import: nothing is asked: no name field, no sampling choice, no confirm", (await page.locator("#lib-name, #lib-sampling").count()) === 0);
  check("import: no network request during the import", requests.length === before, requests.slice(before).join(", "));
  const stored = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("checkir-libraries");
    const dir = await root.getDirectoryHandle("mia-libreria");
    return (await (await dir.getFileHandle("data.bin")).getFile()).size;
  });
  check("import: data.bin in OPFS has one spectrum (the repeated file is left out) on the 1576-point grid", stored === 1576 * 4, String(stored));

  await folderScenario(page, jdx, check);
  const withPrivate = await axe(page);
  check("import: axe has no violations with a private library", withPrivate.length === 0, withPrivate.join(", "));
  await page.setViewportSize({ width: 320, height: 700 });
  check("libraries: no horizontal scroll at 320 px with the list open", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1366, height: 768 });
  await packageScenario(page, check);

  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="mia-libreria"]').waitFor();
  check("import: the private library is still there after a reload", true);
  check("import: only preferences are kept in localStorage", await page.evaluate(() => Object.keys(localStorage).every((k) => /^checkir\.(lang|theme|panel|shortcuts|autoMatch|libsw\.[a-z0-9-]+)$/.test(k))));
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

/** A public library that is off costs only its manifest: switching it on downloads it once (URL with `?v=`), the switch is remembered for it as for every library, and off again forgets the preference. */
export async function lazyScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT" });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => ["fetch", "xhr"].includes(r.resourceType()) && requests.push(r.url()));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="checkir-demo"]').waitFor();
  const asked = (file) => requests.filter((u) => u.includes(`librerie/checkir-demo/${file}`));
  check("lazy: a library that is off shows its name but its spectra are not requested", asked("data.bin").length === 0 && asked("manifest.json").length >= 1 && /Spettri: 1/.test((await page.locator('[data-library="checkir-demo"]').textContent()) ?? ""), requests.join(", "));
  await page.getByRole("checkbox", { name: /checkir-demo/ }).check();
  await page.waitForFunction(() => document.querySelector('[data-chip="library"]')?.textContent?.includes("2 · 12"));
  check("lazy: switching it on downloads data.bin once, with ?v=, and the library joins the count", asked("data.bin").length === 1 && /data\.bin\?v=[0-9a-f]{12}$/.test(asked("data.bin")[0]), asked("data.bin").join());
  check("lazy: the switch is remembered as libsw.<id> = 1", (await page.evaluate(() => localStorage.getItem("checkir.libsw.checkir-demo"))) === "1");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.waitForFunction(() => document.querySelector('[data-chip="library"]')?.textContent?.includes("2 · 12"));
  check("lazy: after a reload the library is still on", await page.getByRole("checkbox", { name: /checkir-demo/ }).isChecked());
  await page.getByRole("checkbox", { name: /checkir-demo/ }).uncheck();
  check("lazy: off again is the default, so the preference is forgotten", (await page.evaluate(() => localStorage.getItem("checkir.libsw.checkir-demo"))) === null);
  await ctx.close();
}

/** After the first visit the libraries that are on are available with no network at all. */
export async function offlineScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT" });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/librerie\/swgdrug-ir\/data\.bin\?v=[0-9a-f]{12}$/.test(r.url)) return true;
    return false;
  });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await openLibraries(page);
  await page.locator('[data-library="swgdrug-ir"]').waitFor();
  await page.locator('[data-library="checkir-demo"]').waitFor(); // a library that is off is still listed offline
  check("offline: a library that is on is available without network after the first visit", await page.getByRole("checkbox", { name: /swgdrug-ir/ }).isChecked() && ((await page.textContent('[data-chip="library"]')) ?? "").includes("1 · 11"));
  await ctx.close();
}
