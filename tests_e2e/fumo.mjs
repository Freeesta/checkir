// Smoke e2e: the page loads, draws the synthetic spectrum with its table, is keyboard-operable, axe
// (light and dark), fits a 320 px viewport (zoom 400 %), and numbers use the decimal point in both languages.
import { readFile, readdir } from "node:fs/promises";
import { chromium, firefox, webkit } from "playwright";
import { FIXTURE } from "./caricamento.mjs";
import { registryScenario } from "./registri.mjs";
import { startSite } from "./sito.mjs";
import { quiet } from "./conteggio.mjs";
import { versionScenario } from "./versione.mjs";

const axeSource = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const { base, close } = await startSite();

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + detail}`);
  if (!ok) failures++;
}

async function axe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ") + " " + n.any.map((a) => a.message).join("; ")).join(" | ")}`));
}

/** Light and dark colour schemes: the page draws, axe is clean (also with a file loaded and with a forced data-theme). */
async function schemeScenario(browser, scheme) {
  const ctx = await browser.newContext({ colorScheme: scheme, locale: "it-IT" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.click('[data-action="info.open"]');
  check(`[${scheme}] engine version in the info dialog, none in the footer`, /\d+\.\d+\.\d+/.test(await page.textContent("dialog .dialog-body")) && !/\d+\.\d+\.\d+/.test(await page.textContent(".footer")));
  await page.click('dialog [aria-label]');
  await page.waitForSelector("dialog", { state: "detached" });
  const violations = await axe(page);
  check(`[${scheme}] axe has no violations`, violations.length === 0, violations.join(", "));
  await page.click('[data-action="demo.load"]');
  check(`[${scheme}] demo: curve and table drawn`, (await page.locator("#chart polyline.curve").count()) === 1 && (await page.locator("#table tbody tr").count()) > 10);
  const withFile = await axe(page);
  check(`[${scheme}] axe has no violations with a file loaded`, withFile.length === 0, withFile.join(", "));
  for (const forced of ["light", "dark"]) {
    await page.evaluate((m) => (document.documentElement.dataset.theme = m), forced);
    const v = await axe(page);
    check(`[${scheme}] axe has no violations with data-theme=${forced}`, v.length === 0, v.join(", "));
  }
  check(`[${scheme}] no console errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** Phone width (zoom 400 %), keyboard, decimal point, language switch. */
async function phoneScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", FIXTURE.pathname);
  await page.waitForSelector("#chart polyline.curve");
  check("zoom 400 % (320 px): no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  check("320 px: the sheets link stays in the header, inside the viewport", await page.evaluate(() => { const r = document.querySelector("#app-header .sheets-link")?.getBoundingClientRect(); return Boolean(r) && r.width > 0 && r.right <= document.documentElement.clientWidth; }));
  await page.keyboard.press("Tab");
  check("Tab: first element is the skip link", await page.evaluate(() => document.activeElement?.className === "skip"));
  await page.focus("#chart");
  const before = await page.textContent("#range");
  await page.keyboard.press("+");
  const after = await page.textContent("#range");
  check("keyboard: + zooms in", before !== after && after.includes("4000") === false, `${before} -> ${after}`);
  await page.keyboard.press("0");
  check("keyboard: 0 restores the full view", (await page.textContent("#range")) === before);
  check("numbers use the decimal point, no thousands separator", /da 400 a 4000 cm/.test(before) && !/[.,]\d{3}\b/.test(before), before);
  await page.click("#tabbar [data-goto='results']");
  check("320 px: a tab opens its section as a full page", await page.evaluate(() => document.body.dataset.section === "results" && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.click(".panel-back");
  await page.click(".menu-button");
  check("320 px: the menu shows the tools", await page.isVisible("#lang-button"));
  await page.click("#lang-button");
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  await page.keyboard.press("Escape"); // the open phone menu overlays the chart toolbar, which axe would count as an obscured target
  await page.waitForFunction(() => document.querySelector("#chart svg > text:last-child")?.textContent === "Absorbance", null, { timeout: 5000 }).catch(() => {});
  const axis = await page.textContent("#chart svg > text:last-child");
  check("language switch to English", axis === "Absorbance", axis ?? "");
  check("table: decimal point in English", /^\d+\.\d{4}$/.test((await page.locator("#table tbody tr:first-child td:nth-child(2)").textContent()) ?? ""));
  const violationsEn = await axe(page);
  check("[en] axe has no violations", violationsEn.length === 0, violationsEn.join(", "));
  await ctx.close();
}

/** The guided "next step" button shows the first enabled step (today only "Open") and opens the file chooser. */
async function nextStepScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("next step: shows Carica", (await page.textContent("#workbar .primary"))?.trim() === "Carica");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#workbar .primary")]);
  check("next step: opens the file chooser", Boolean(chooser));
  await ctx.close();
}

/** Single-key shortcuts: the list, the actions, fields and the chart keep their keys, the switch turns them all off and the choice survives a reload. */
async function shortcutsScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.keyboard.press("?");
  check("shortcuts: ? opens the list", await page.isVisible("dialog[open] .help-table"));
  check("shortcuts: the list has a row for every key", (await page.locator("dialog[open] .help-table tbody tr").count()) >= 18);
  const violations = await axe(page);
  check("shortcuts: axe has no violations on the dialog", violations.length === 0, violations.join(", "));
  for (const n of [1, 2]) {
    await page.click(`#help-tab-${n}`);
    const v = await axe(page);
    check(`shortcuts: axe has no violations on tab ${n}`, v.length === 0, v.join(", "));
  }
  await page.keyboard.press("l");
  check("shortcuts: with the dialog open the letters do nothing", (await page.getAttribute("html", "lang")) === "it");
  await page.keyboard.press("Escape");
  // The browser handles the close request after the key event returns, so wait for the dialog to go before looking at the focus.
  await page.waitForSelector("dialog", { state: "detached" });
  check("shortcuts: Esc closes the list and gives the focus back", !(await page.isVisible("dialog")) && (await page.evaluate(() => document.activeElement === document.body)));
  await page.keyboard.press("l");
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  check("shortcuts: l changes the language", true);
  await page.keyboard.press("l");
  await page.waitForFunction(() => document.body.dataset.langReady === "it");
  await page.keyboard.press("t");
  check("shortcuts: t changes the theme", (await page.getAttribute("html", "data-theme")) === "light");
  const before = await page.getAttribute("body", "data-panel");
  await page.keyboard.press("[");
  check("shortcuts: [ folds the panel", (await page.getAttribute("body", "data-panel")) !== before);
  await page.keyboard.press("2");
  check("shortcuts: 2 moves the focus to the Libraries section", await page.evaluate(() => document.activeElement?.closest("[data-panel]")?.getAttribute("data-panel") === "libraries"));
  await page.evaluate(() => { const i = document.createElement("input"); i.type = "text"; i.id = "probe"; document.body.append(i); i.focus(); });
  await page.keyboard.press("l");
  check("shortcuts: in a text field l types an l", (await page.inputValue("#probe")) === "l" && (await page.getAttribute("html", "lang")) === "it");
  await page.evaluate(() => document.getElementById("probe")?.remove());
  await page.keyboard.press("Control+l");
  check("shortcuts: with Ctrl pressed nothing happens", (await page.getAttribute("html", "lang")) === "it");
  await page.setInputFiles("input[type=file]", FIXTURE.pathname);
  await page.waitForSelector("#chart polyline.curve");
  const range = await page.textContent("#range");
  await page.focus("#chart");
  await page.keyboard.press("+");
  check("shortcuts: with the focus on the chart + zooms and nothing else", (await page.textContent("#range")) !== range && (await page.getAttribute("html", "lang")) === "it" && !(await page.isVisible("dialog")));
  check("shortcuts: buttons announce their key", (await page.getAttribute('[data-action="theme.cycle"]', "aria-keyshortcuts")) === "t");
  await page.keyboard.press("?");
  await page.uncheck("#shortcuts-switch");
  await page.keyboard.press("Escape");
  check("shortcuts: switched off, aria-keyshortcuts is gone", (await page.getAttribute('[data-action="theme.cycle"]', "aria-keyshortcuts")) === null);
  for (const k of ["l", "?", "t", "["]) await page.keyboard.press(k);
  check("shortcuts: switched off, no key acts", (await page.getAttribute("html", "lang")) === "it" && !(await page.isVisible("dialog")) && (await page.getAttribute("html", "data-theme")) === "light");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await page.keyboard.press("?");
  await page.keyboard.press("l");
  check("shortcuts: the switch survives a reload", !(await page.isVisible("dialog")) && (await page.getAttribute("html", "lang")) === "it");
  await page.click('[data-action="help.open"]');
  check("shortcuts: the list still opens from its button and shows the switch off", !(await page.isChecked("#shortcuts-switch")));
  await ctx.close();
}

/** Shell behaviour: Tab order in the header, tooltip and Esc, theme and panel preferences survive a reload, nothing of the analysis is stored. */
async function shellScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.keyboard.press("Tab");
  const stops = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => ({ inHeader: Boolean(document.activeElement?.closest("#app-header")), left: document.activeElement?.getBoundingClientRect().left ?? -1 })));
  }
  check("Tab: the 9 header controls come in visual order", stops.every((x, i) => x.inHeader && (i === 0 || x.left > stops[i - 1].left)), JSON.stringify(stops));
  await page.focus('[data-action="info.open"]');
  check("tooltip: shows on keyboard focus", await page.isVisible("#tooltip"));
  await page.keyboard.press("Escape");
  check("tooltip: Esc closes it", !(await page.isVisible("#tooltip")));
  await page.click('[data-action="theme.cycle"]');
  check("theme: the first click goes from auto to light", (await page.getAttribute("html", "data-theme")) === "light");
  await page.click('[data-action="theme.cycle"]');
  await page.click('[data-action="theme.cycle"]');
  check("theme: it cycles back to auto", (await page.getAttribute("html", "data-theme")) === "auto");
  await page.click('[data-action="theme.cycle"]');
  await page.click('[data-action="panel.toggle"]');
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("theme: the choice survives a reload", (await page.getAttribute("html", "data-theme")) === "light");
  check("panel: the folded panel stays folded after a reload", (await page.getAttribute("body", "data-panel")) === "rail");
  await page.click('[data-action="panel.toggle"]');
  await page.click('[data-action="demo.load"]');
  const stored = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
  }));
  const allowed = ["checkir.lang", "checkir.theme", "checkir.panel", "checkir.panelWidth", "checkir.shortcuts", "checkir.autoMatch", "checkir.textLevel", "checkir.modeAnim"];
  check("privacy: only preferences are stored, nothing of the analysis", stored.local.every((k) => allowed.includes(k) || k.startsWith("checkir.libsw.")) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
  await ctx.close();
}

/** The product name lives only in appname.js: swapping that module changes it everywhere (title, heading, catalog text, manifest id). */
async function nameScenario(browser) {
  const ctx = await browser.newContext({ locale: "it-IT" });
  await ctx.route("**/appname.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export const APP_NAME = "provanome"; export const APP_ID = "provaid"; export const STORAGE_PREFIX = "provaid."; export const GITHUB_URL = "https://github.com/x/y/"; export const SITE_URL = "https://x.github.io/y/";' }),
  );
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("name: title, heading and footer show APP_NAME", (await page.title()) === "provanome" && (await page.textContent("#app-name")) === "provanome" && (await page.textContent(".footer")) === "provanome");
  check("name: default name absent from the page", !/checkir/i.test(await page.evaluate(() => document.body.innerText + document.title)));
  await ctx.close();
}

/** The text page: reached from the info dialog, texts in both languages (no raw key), axe clean in light and dark, no horizontal scroll at 320 px. */
async function pagesScenario(browser) {
  const pages = [{ slug: "informativa", link: 0, items: 8 }];
  for (const scheme of ["light", "dark"]) {
    for (const p of pages) {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: "it-IT", viewport: { width: 320, height: 640 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(base);
      await page.waitForSelector("body[data-ready='1']");
      await page.keyboard.press("i"); // the info button hides in the ⋯ menu at 320 px
      await page.locator("dialog .footer-links a").nth(p.link).click();
      await page.waitForSelector(`body[data-page][data-ready='1']`);
      check(`[${scheme}] ${p.slug}: reached from the info dialog`, page.url().endsWith(`/pagine/${p.slug}/`), page.url());
      for (const lang of ["it", "en"]) {
        if (lang === "en") {
          await page.click("#lang-button");
          await page.click('[data-lang="en"]');
          await page.waitForFunction(() => document.body.dataset.langReady === "en");
        }
        const tag = `[${scheme}] ${p.slug} ${lang}`;
        const raw = await page.evaluate(() => [...document.querySelectorAll("[data-i18n]")].filter((e) => !e.textContent || /^[a-z]+\.[a-z0-9_.]+$/.test(e.textContent)).map((e) => e.getAttribute("data-i18n")));
        check(`${tag}: every text is translated`, raw.length === 0, raw.join(", "));
        check(`${tag}: ${p.items} sections and no draft line`, (await page.locator(".doc > li").count()) === p.items && (await page.locator(".draft, .warnings-box").count()) === 0);
        check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        const v = await axe(page);
        check(`${tag}: axe has no violations`, v.length === 0, v.join(", "));
      }
      check(`[${scheme}] ${p.slug}: no console errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }
}

/** Loading screen: only the photon drawing, hidden label "Caricamento"/"Loading" in a status region, animated (static with reduced motion), gone when the page is ready. */
async function splashScenario(browser) {
  for (const [motion, locale, word] of [["no-preference", "it-IT", /Caricamento/], ["reduce", "en-GB", /Loading/]]) {
    const ctx = await browser.newContext({ locale, reducedMotion: motion });
    const page = await ctx.newPage();
    await page.route("**/wasm/*.wasm", async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
    await page.goto(base, { waitUntil: "commit" });
    await page.waitForFunction(() => document.getElementById("splash-label")?.textContent);
    const info = await page.evaluate(() => {
      const s = document.getElementById("splash");
      return { role: s?.getAttribute("role"), label: s?.textContent?.trim(), labelWidth: document.getElementById("splash-label")?.getBoundingClientRect().width, textOutside: [...(s?.children ?? [])].filter((c) => c.id !== "splash-label").map((c) => c.textContent?.trim()).join(""), animations: s?.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length };
    });
    const tag = `splash (${motion})`;
    check(`${tag}: status role, translated hidden label, no visible text`, info.role === "status" && word.test(info.label ?? "") && info.labelWidth <= 1 && info.textOutside === "", JSON.stringify(info));
    check(`${tag}: ${motion === "reduce" ? "static" : "animated"}`, motion === "reduce" ? info.animations === 0 : (info.animations ?? 0) > 0, String(info.animations));
    // crest = local minimum of y (SVG y points down); a crest present in one frame must reappear a little to the right in the next
    const crests = () => page.evaluate(() => {
      const pts = (document.querySelector(".splash-wave")?.getAttribute("d") ?? "").split(/[ML]/).filter(Boolean).map((q) => q.split(" ").map(Number));
      return pts.filter((q, i) => i > 0 && i < pts.length - 1 && q[1] < pts[i - 1][1] && q[1] <= pts[i + 1][1]).map((q) => q[0]);
    });
    const frames = [await crests()];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(60);
      frames.push(await crests());
    }
    // smallest signed shift (mod the 40-unit wavelength, folded into -20..20) of the crest positions between consecutive frames
    const shift = (a, b) => { const w = 40; const m = (b[0] - a[0] + 3 * w / 2) % w - w / 2; return m; };
    const shifts = frames.slice(1).map((f, i) => shift(frames[i], f));
    check(`${tag}: ${motion === "reduce" ? "wave still" : "wave crests travel to the right"}`, motion === "reduce" ? shifts.every((d) => d === 0) : shifts.every((d) => d > 0 && d < 10), JSON.stringify({ frames, shifts }));
    await page.waitForSelector("body[data-ready='1']");
    await page.waitForSelector("#splash", { state: "detached", timeout: 2000 });
    check(`${tag}: removed when ready`, (await page.locator("#splash").count()) === 0);
    await ctx.close();
  }
}

/** Every scenario in a fixed order; SHARD="i/n" (1-based) runs scenarios i, i+n, i+2n… so n parallel jobs together run exactly all of them. */
async function scenarios(browser) {
  // Every tests_e2e/scenari/*.mjs default-exports one scenario; they follow the shell ones in name order.
  const files = (await readdir(new URL("./scenari/", import.meta.url))).filter((f) => f.endsWith(".mjs")).sort();
  const found = files.map((f) => async () => (await import(`./scenari/${f}`)).default({ browser, base, check, axe }));
  return [
    () => schemeScenario(browser, "light"),
    () => schemeScenario(browser, "dark"),
    () => phoneScenario(browser),
    () => nextStepScenario(browser),
    () => shellScenario(browser),
    () => shortcutsScenario(browser),
    () => registryScenario(check),
    () => versionScenario(check),
    () => nameScenario(browser),
    () => splashScenario(browser),
    () => pagesScenario(browser),
    ...found,
    () => browser.close(),
  ];
}

function pickShard(list) {
  const m = /^(\d+)\/(\d+)$/.exec(process.env.SHARD ?? "1/1");
  if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error(`bad SHARD ${process.env.SHARD}`);
  return list.filter((_, i) => i % +m[2] === +m[1] - 1);
}

async function run() {
  const browser = quiet(await { chromium, firefox, webkit }[process.env.BROWSER || "chromium"].launch({ executablePath: process.env.CHROMIUM_PATH || undefined }), base);
  try {
    for (const step of pickShard(await scenarios(browser))) await step();
  } finally {
    await browser.close();
    close();
  }
  console.log(failures ? `${failures} checks failed` : "all checks ok");
  process.exit(failures ? 1 : 0);
}

run();
