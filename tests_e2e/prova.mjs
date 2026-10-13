// Library test e2e: the button in the information dialog, progress, the report, the CSV and what leaves the page (nothing),
// on a synthetic library with a known answer (alfa and alfa_bis are the same material under two names).
import { ALFA, ALFA_BIS, BETA, GAMMA, jcamp } from "./confronto.mjs";

/** @param {import("playwright").Browser} browser */
export async function libraryTestScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const outside = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) outside.push(r.url());
  });
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.locator('details[data-panel="libraries"]').evaluate((d) => (d.open = true));
  await page.getByRole("checkbox", { name: /swgdrug-ir/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  await page.setInputFiles('input[data-library="files"]', [
    { name: "alfa.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa", ALFA) },
    { name: "beta.jdx", mimeType: "application/octet-stream", buffer: jcamp("beta", BETA) },
    { name: "gamma.jdx", mimeType: "application/octet-stream", buffer: jcamp("gamma", GAMMA) },
    { name: "alfa_bis.jdx", mimeType: "application/octet-stream", buffer: jcamp("alfa_bis", ALFA_BIS) },
  ]);
  await page.locator('[data-library="sintetica"]').waitFor();
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));

  await page.click('[data-action="info.open"]');
  check("test: with a library the button is enabled and Stop is not", !(await page.isDisabled("#prova-start")) && (await page.isDisabled("#prova-stop")));
  await page.click("#prova-start");
  await page.waitForSelector(".prova-report", { timeout: 30000 });
  const report = (await page.textContent(".prova-report")) ?? "";
  check("test: all four spectra were tested", /Spettri provati: 4 di 4/.test(report), report);
  check("test: the wrong 'probable' count is shown as a plain number (alfa and alfa_bis find each other)", /Falsi «probabile» con le soglie attuali: 2 /.test(report), report);
  check("test: one strong twin pair is counted", /con r ≥ 0\.98: 1;/.test(report), report);
  check("test: the twin table names both spectra", (await page.locator(".prova-report table", { hasText: "alfa_bis" }).count()) >= 1 && (await page.locator(".prova-report table", { hasText: /alfa \(/ }).count()) >= 1);
  check("test: the histogram has its description and its data table", (await page.getAttribute("svg.prova-hist", "role")) === "img" && (await page.locator(".prova-report details table tbody tr").count()) === 20);
  check("test: the thresholds are drawn", (await page.locator("svg.prova-hist line.prova-line-probable").count()) === 1 && (await page.locator("svg.prova-hist line.prova-line-check").count()) === 1);
  check("test: no tick or colour word is used and no generic caution text", !/[✓✔]|verde|green|probabilità/i.test(report));
  check("test: decimals use the point", !/\d,\d/.test(report), report);
  check("test: the button is back to Start (the test is complete)", /Avvia la prova/.test((await page.textContent("#prova-start")) ?? ""));

  const [download] = await Promise.all([page.waitForEvent("download"), page.click(".prova-report button")]);
  const csv = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  const lines = csv.trim().split("\n");
  check("test: the CSV has a header and ids and names only", lines[0].startsWith("kind,r,library_a,id_a") && lines.every((l) => l.split(",").length === 10), csv);
  check("test: the CSV lists the wrong probable matches and the twin", lines.filter((l) => l.startsWith("probable_wrong")).length === 2 && lines.filter((l) => l.startsWith("twin_strong")).length === 1, csv);

  const v = await axe(page);
  check("test: axe has no violations with the report", v.length === 0, v.join(", "));
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog", { state: "detached" });
  await page.click('[data-action="info.open"]');
  check("test: reopening the dialog keeps the result", (await page.locator(".prova-report").count()) === 1);
  await page.click('[data-lang="en"]').catch(() => {});
  check("test: nothing went out of the page and nothing was stored", outside.length === 0 && (await page.evaluate(() => !/prova|library-test/.test(JSON.stringify({ ...localStorage })))), outside.join(" "));
  check("test: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
