// Watched folder (read only): a folder of the origin private file system stands in for the folder the instrument software writes to,
// through a stand-in for `showDirectoryPicker`. Proves: old files are neither listed nor opened, a file written in pieces waits,
// a complete file is offered once, a broken one is reported, "ignore" and "open at once" work, only the folder reference can be stored
// (and only on request), no file name reaches the storage or the page outside section 1, nothing goes to the network.
// Without the API only "open the latest measurement of a folder" exists.
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = new URL("../crates/ftir-core/tests/fixtures/jcamp/affn_ascending.jdx", import.meta.url);

/** Init script: the picker hands out the folder "misure" of the origin private file system; the native observer is off, so the 2 s scan is what is tested. */
export const FAKE_PICKER = `
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("misure", { create: true });
  delete window.FileSystemObserver;
`;

/** Write `name` into the fake folder, keeping only the first `keep` bytes (a file still being written). */
const put = (page, name, b64, keep) =>
  page.evaluate(
    async ({ name, b64, keep }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("misure", { create: true });
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).slice(0, keep ?? undefined);
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(bytes);
      await w.close();
    },
    { name, b64, keep: keep ?? null },
  );

const offers = (page) => page.locator(".folder-offers li");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Names that must stay inside section 1: the page outside it, and every kind of storage. */
async function leaksOf(page, names) {
  return page.evaluate(async (names) => {
    const hit = [];
    for (const node of document.querySelectorAll("body *")) {
      if (node.closest('[data-panel="files"]')) continue;
      const own = [...node.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("") + [...node.attributes].map((a) => a.value).join(" ");
      if (names.some((n) => own.includes(n))) hit.push(node.tagName);
    }
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      for (const store of db.objectStoreNames) parts.push(store, await new Promise((ok) => { const r = db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => ok(JSON.stringify(r.result)); }));
      db.close();
    }
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) parts.push(req.url);
    if (names.some((n) => parts.join("\n").includes(n))) hit.push("storage");
    return hit;
  }, names);
}

/** A page with the stand-in picker, recording requests and page errors. */
async function watchedPage(browser, base) {
  const b64 = (await readFile(FIXTURE)).toString("base64");
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(FAKE_PICKER);
  const seen = { requests: [], errors: [] };
  ctx.on("request", (r) => seen.requests.push(r.url()));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => seen.errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  return { b64, ctx, page, seen };
}

/** The watched-folder scenario with the folder API present: detection, offers, opening. */
async function watchScenario(browser, base, check, axe) {
  const { b64, ctx, page, seen } = await watchedPage(browser, base);
  check("folder: off at the start, nothing stored", (await page.locator("#folder-choose").count()) === 1 && (await page.evaluate(async () => (await indexedDB.databases()).length)) === 0);
  check("folder: the boxes are not there while idle", (await page.locator("#folder-remember").count()) === 0);
  check("folder: axe is clean before the activation", (await axe(page)).length === 0);

  for (let i = 0; i < 50; i++) await put(page, `vecchio_${i}.jdx`, b64);
  await page.click("#folder-choose");
  await page.waitForSelector("#folder-stop");
  check("folder: the remember and open-at-once boxes start unchecked", !(await page.isChecked("#folder-remember")) && !(await page.isChecked("#folder-auto")));
  check("folder: the folder name is shown, not a path", ((await page.textContent(".folder")) ?? "").includes("«misure»"));
  await wait(5000);
  const old = (await page.textContent("#panel")) ?? "";
  check("folder: the 50 old files are neither offered nor listed nor opened", (await offers(page).count()) === 0 && !old.includes("vecchio_") && old.includes("Nessuno spettro"));

  for (const keep of [200, 800, 1500, 2300]) {
    await put(page, "misura_nuova.jdx", b64, keep);
    await wait(1100);
  }
  check("folder: a file still being written is not offered", (await offers(page).count()) === 0);
  await put(page, "misura_nuova.jdx", b64);
  await page.waitForSelector(".folder-offers li", { timeout: 20000 });
  await wait(5000);
  const label = (await offers(page).first().textContent()) ?? "";
  check("folder: the complete file is offered once, by name", (await offers(page).count()) === 1 && label.includes("Nuova misura: misura_nuova.jdx"), label);
  check("folder: nothing was opened by itself", ((await page.textContent("#panel")) ?? "").includes("Nessuno spettro"));
  check("folder: axe is clean with an offer shown", (await axe(page)).length === 0);
  check("folder: the name stays in section 1 (the announcement does not carry it)", (await leaksOf(page, ["misura_nuova", "vecchio_"])).length === 0);

  await offers(page).first().getByRole("button", { name: /^Apri/ }).click();
  await page.waitForSelector("#chart polyline.curve");
  check("folder: Open reads the measurement as a loaded file (C1) and removes the offer", (await page.textContent('[data-chip="file"]'))?.trim().startsWith("C1") === true && (await offers(page).count()) === 0);

  await put(page, "rotto.jdx", Buffer.from("questo non e uno spettro").toString("base64"));
  await page.waitForSelector(".folder [role=alert]", { timeout: 60000 });
  const busy = (await page.textContent(".folder [role=alert]")) ?? "";
  check("folder: a file that cannot be read gets a warning (and no offer)", busy.includes("rotto.jdx") && busy.includes("non è leggibile") && (await offers(page).count()) === 0, busy);

  await put(page, "da_ignorare.jdx", b64);
  await page.waitForSelector(".folder-offers li", { timeout: 20000 });
  await offers(page).first().getByRole("button", { name: /^Ignora/ }).click();
  await wait(5000);
  check("folder: an ignored measurement is not offered again", (await offers(page).count()) === 0);

  await page.check("#folder-auto");
  await put(page, "subito.jdx", b64);
  await page.waitForSelector('[data-fk="sel-C2"]', { timeout: 20000 });
  check("folder: with open-at-once the new measurement opens (C2) without an offer", (await offers(page).count()) === 0);
  await page.uncheck("#folder-auto");
  await rememberScenario(page, b64, check);
  const foreign = seen.requests.filter((u) => !u.startsWith(base) && !/^(data|blob|about):/.test(u));
  check("folder: no request left the site", foreign.length === 0, foreign.join(", "));
  check("folder: no page error", seen.errors.length === 0, seen.errors.join(" | "));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.click('.tab[data-goto="files"]');
  check("folder: no horizontal scroll at 320 px", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await ctx.close();
}

/** Remembering the folder: only a reference, only on request, gone when unchecked; resuming after a reload; stopping. */
async function rememberScenario(page, b64, check) {
  await page.check("#folder-remember");
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === "checkir-folder"));
  const kept = await page.evaluate(async () => {
    const db = await new Promise((ok) => { const r = indexedDB.open("checkir-folder"); r.onsuccess = () => ok(r.result); });
    const keys = await new Promise((ok) => { const r = db.transaction("ref").objectStore("ref").getAllKeys(); r.onsuccess = () => ok(r.result); });
    db.close();
    return keys;
  });
  check("folder: remembering stores a single reference under a fixed key", JSON.stringify(kept) === '["watched"]', JSON.stringify(kept));
  check("folder: no file name reaches the page outside section 1 or any storage", (await leaksOf(page, ["misura_nuova", "vecchio_", "rotto", "da_ignorare", "subito"])).length === 0);
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await page.waitForSelector("#folder-resume");
  check("folder: after a reload the remembered folder is offered to resume, not watched", (await page.locator("#folder-stop").count()) === 0 && ((await page.textContent("#folder-resume")) ?? "").includes("«misure»"));
  await page.click("#folder-resume");
  await page.waitForSelector("#folder-stop");
  await put(page, "dopo_riavvio.jdx", b64);
  await page.waitForSelector(".folder-offers li", { timeout: 20000 });
  check("folder: after resuming only the new file is offered", (await offers(page).count()) === 1 && ((await offers(page).first().textContent()) ?? "").includes("dopo_riavvio.jdx"));
  await page.uncheck("#folder-remember");
  await page.waitForFunction(async () => (await indexedDB.databases()).length === 0);
  check("folder: unchecking forgets the folder and leaves no database", (await page.locator("#folder-resume").count()) === 0);

  await page.click("#folder-stop");
  check("folder: stopping clears the offers and goes back to the choice", (await offers(page).count()) === 0 && (await page.locator("#folder-choose").count()) === 1);
}

/** Without the folder API only the plain folder chooser (latest measurement) is offered. */
async function fallbackScenario(browser, base, check, axe) {
  const b64 = await readFile(FIXTURE);
  const root = await mkdtemp(join(tmpdir(), "cartella-"));
  const dir = join(root, "misure");
  await mkdir(join(dir, "sotto"), { recursive: true });
  await writeFile(join(dir, "vecchia.jdx"), b64);
  await writeFile(join(dir, "nuova.jdx"), b64);
  await writeFile(join(dir, "sotto", "piu_nuova.jdx"), b64);
  await writeFile(join(dir, "nota.pdf"), "x");
  await utimes(join(dir, "vecchia.jdx"), new Date(2020, 0, 1), new Date(2020, 0, 1));
  await utimes(join(dir, "nuova.jdx"), new Date(2024, 0, 1), new Date(2024, 0, 1));
  await utimes(join(dir, "sotto", "piu_nuova.jdx"), new Date(2025, 0, 1), new Date(2025, 0, 1));
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript("delete window.showDirectoryPicker;");
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.click('.folder button[aria-label^="Spiega"]');
  check("folder (no API): only the latest-measurement button, with the limits said behind the info button", (await page.locator("#folder-choose").count()) === 0 && (await page.locator("#folder-last").count()) === 1 && ((await page.textContent("body")) ?? "").includes("Chrome o Edge"));
  check("folder (no API): axe is clean", (await axe(page)).length === 0);
  await page.setInputFiles("input[webkitdirectory]", dir);
  await page.waitForSelector('[data-fk="sel-C1"]', { state: "attached" });
  const row = (await page.textContent('[data-fk="sel-C1"]')) ?? "";
  check("folder (no API): the newest file of the first level opens, files in sub-folders and other types are left out", row.includes("nuova.jdx") && !row.includes("piu_nuova") && (await page.locator('[data-fk="sel-C2"]').count()) === 0, row);
  await ctx.close();
  await rm(root, { recursive: true, force: true });
}

/** @param {import("playwright").Browser} browser */
export async function folderScenario(browser, base, check, axe) {
  await watchScenario(browser, base, check, axe);
  await fallbackScenario(browser, base, check, axe);
}
