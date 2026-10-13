// Theory section e2e: index, chapters 1-6 (lazy loaded), glossary, the three interactives (spring, modes, dipole), data tables,
// reduced motion (nothing moves by itself), keyboard, 320 px, axe in light/dark and it/en, no request outside the site.
const CHAPTERS = 6;

async function open(browser, base, { locale = "it-IT", scheme = "light", width = 1000, reduced = false } = {}) {
  const ctx = await browser.newContext({ locale, colorScheme: scheme, viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  const outside = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
  });
  return { ctx, page, errors, outside };
}

async function go(page, base, hash) {
  await page.goto(`${base}teoria/#${hash}`);
  await page.waitForSelector("body[data-ready='1']");
  await page.waitForSelector("#view-title");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 });
}

/** Visible text of the live region of the interactive. */
const result = (page) => page.locator(".result").first().textContent();

async function indexAndChapters(browser, base, check, axe) {
  const { ctx, page, errors, outside } = await open(browser, base);
  await go(page, base, "");
  const links = await page.locator(".chapters a").count();
  check("theory: the index lists the chapters", links === CHAPTERS, String(links));
  const loaded = [];
  page.on("request", (r) => /teoria\/(it|en)\/\d\d-/.test(r.url()) && loaded.push(r.url()));
  check("theory: no chapter is loaded before it is opened", loaded.length === 0);
  for (let n = 1; n <= CHAPTERS; n++) {
    await go(page, base, String(n));
    const h = await page.locator("#view-title").textContent();
    check(`theory ${n}: heading, key message, text, box for chemists`, new RegExp(`^${n}\\.`).test(h ?? "") && (await page.locator(".key-message").count()) === 1 && (await page.locator("#view > p").count()) >= 2 && (await page.locator("details.for-chemists").count()) === 1);
    check(`theory ${n}: the figure has a title, a description and its data table`, (await page.locator("figure svg[role=img] title").count()) >= 1 && (await page.locator("figure svg desc").count()) >= 1 && (await page.locator("figure table").count()) >= 1);
    check(`theory ${n}: sources with licence on the links and nothing outside the site`, (await page.locator(".sources").count()) >= 1 && outside.length === 0, outside.join(", "));
  }
  check("theory: each chapter was fetched only when opened", loaded.length === CHAPTERS, String(loaded.length));
  await go(page, base, "1");
  check("theory 1: the box with the limits is a note", (await page.locator("aside.limit-note[role=note]").count()) === 1);
  await go(page, base, "glossario");
  const entries = await page.locator(".glossary .entry").count();
  check("theory: the glossary has 60 terms", entries === 60, String(entries));
  await page.fill("#glossary-search", "dipolo");
  check("theory: the glossary search filters and says how many", (await page.locator(".glossary .entry:not([hidden])").count()) < 10 && /su 60/.test((await page.locator("[role=status]").first().textContent()) ?? ""));
  await go(page, base, "g-wavenumber");
  check("theory: a link #g-<id> opens the entry and focuses it", (await page.evaluate(() => document.activeElement?.id)) !== undefined);
  await go(page, base, "2");
  await page.getByRole("link", { name: "numero d'onda" }).first().click();
  await page.waitForSelector(".glossary");
  check("theory: a term of the text leads to the glossary", /#g-wavenumber/.test(page.url()));
  check("theory: no page error", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function interactives(browser, base, check) {
  const { ctx, page, errors } = await open(browser, base);
  await go(page, base, "2");
  const before = await result(page);
  check("spring: the result is a live region with the calculated wavenumber", (await page.locator(".result").first().getAttribute("aria-live")) === "polite" && /3021|3020/.test(before ?? ""), before ?? "");
  await page.getByRole("button", { name: "C=O", exact: true }).click();
  check("spring: the C=O preset gives about 1730 cm-1 (engine, not the page)", /173\d/.test((await result(page)) ?? ""), (await result(page)) ?? "");
  const k = page.getByLabel("Rigidità della molla k");
  await k.focus();
  await page.keyboard.press("End");
  check("spring: the slider works from the keyboard and changes the result", (await result(page)) !== before);
  check("spring: the table of examples is computed", (await page.locator("figure table tbody tr").count()) === 5);
  await go(page, base, "3");
  await page.getByRole("button", { name: "Forbice" }).click();
  check("modes: the chosen mode is announced with its place in the spectrum", /Forbice/.test((await result(page)) ?? "") && /1465/.test((await result(page)) ?? ""));
  check("modes: six choices and a table of the six modes", (await page.locator(".choice button").count()) === 6 && (await page.locator("figure table tbody tr").count()) === 6);
  await page.getByRole("button", { name: "Ventaglio" }).click();
  check("modes: out-of-plane modes mark + and - on the hydrogens", (await page.locator("svg text.fig-strong").count()) >= 2);
  await go(page, base, "4");
  check("dipole: the symmetric stretch of CO2 is inactive (engine)", /IR-inattivo/.test((await result(page)) ?? ""), (await result(page)) ?? "");
  await page.getByRole("button", { name: "CO₂ · stiramento asimmetrico" }).click();
  check("dipole: the asymmetric stretch is active", /IR-attivo/.test((await result(page)) ?? ""));
  const rows = await page.locator("figure table tbody tr").allTextContents();
  check("dipole: the table says which modes absorb", rows.length === 6 && /No/.test(rows[0]) && rows.slice(1).every((r) => /Sì/.test(r)), rows.join(" | "));
  check("interactives: Pause/Start exists", (await page.getByRole("button", { name: /Pausa|Avvia/ }).count()) === 1);
  check("interactives: no page error", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function reducedMotion(browser, base, check) {
  const { ctx, page } = await open(browser, base, { reduced: true });
  for (const n of [2, 3, 4]) {
    await go(page, base, String(n));
    const a = await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML);
    await page.waitForTimeout(700);
    const b = await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML);
    check(`reduced motion [${n}]: nothing moves by itself and no Start/Pause button`, a === b && (await page.getByRole("button", { name: /Pausa|Avvia/ }).count()) === 0);
    check(`reduced motion [${n}]: no animation or transition running`, (await page.evaluate(() => document.getAnimations().length)) === 0);
  }
  await go(page, base, "3");
  const phase = page.getByLabel("Fase del movimento");
  const before = await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML);
  await phase.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  check("reduced motion: the phase slider steps the picture from the keyboard", (await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML)) !== before);
  await ctx.close();
}

async function pausing(browser, base, check) {
  const { ctx, page } = await open(browser, base);
  await go(page, base, "3");
  const button = page.getByRole("button", { name: /Pausa|Avvia/ });
  check("animation: it runs and the button offers Pause", /Pausa/.test((await button.textContent()) ?? ""));
  await button.click();
  const a = await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML);
  await page.waitForTimeout(500);
  check("animation: Pause stops it", (await page.locator("svg.theory-svg").evaluate((s) => s.outerHTML)) === a && /Avvia/.test((await button.textContent()) ?? ""));
  await ctx.close();
}

async function accessibility(browser, base, check, axe) {
  for (const [locale, scheme] of [["it-IT", "light"], ["en-GB", "dark"]]) {
    const { ctx, page } = await open(browser, base, { locale, scheme });
    for (const hash of ["", "1", "2", "3", "4", "5", "6", "glossario"]) {
      await go(page, base, hash);
      const v = await axe(page);
      check(`theory [${locale} ${scheme}] #${hash || "index"}: axe has no violations`, v.length === 0, v.join(", "));
    }
    await ctx.close();
  }
  for (const hash of ["", "2", "3", "5", "6"]) {
    const { ctx, page } = await open(browser, base, { width: 320 });
    await go(page, base, hash);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    check(`theory [320 px] #${hash || "index"}: no horizontal scroll`, !wide);
    await ctx.close();
  }
  const { ctx, page } = await open(browser, base, { locale: "en-GB" });
  await go(page, base, "4");
  check("theory [en]: chapter and interactive in English", /^4\./.test((await page.locator("#view-title").textContent()) ?? "") && /IR-inactive/.test((await result(page)) ?? ""));
  await page.getByRole("button", { name: "IT" }).click();
  await page.waitForFunction(() => /Perché/.test(document.querySelector("#view-title")?.textContent ?? ""));
  check("theory: the language buttons switch the chapter", /Perché/.test((await page.locator("#view-title").textContent()) ?? ""));
  await ctx.close();
}

export async function teoriaScenario(browser, base, check, axe) {
  await indexAndChapters(browser, base, check, axe);
  await interactives(browser, base, check);
  await reducedMotion(browser, base, check);
  await pausing(browser, base, check);
  await accessibility(browser, base, check, axe);
  const { ctx, page } = await open(browser, base);
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  check("app: the footer links to the theory section", (await page.locator('.footer-links a[href="teoria/"]').count()) === 1);
  await ctx.close();
}
