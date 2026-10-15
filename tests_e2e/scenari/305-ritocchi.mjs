// Interface touches: the language menu (one button, keyboard), the side panel width (handle: keys and drag, remembered, at most a third of the window), no numbers in the panel headers, chart colours (black/white shown spectrum, red overlay).
export default async ({ browser, base, check, axe }) => {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");

  const heights = await page.evaluate(() => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect();
    const a = box("#lang-button"), b = box('[data-action="theme.cycle"]');
    return { dh: Math.abs(a.height - b.height), dy: Math.abs(a.top - b.top) };
  });
  check("lang: one button, same height and baseline as the other tools", heights.dh < 1 && heights.dy < 1 && (await page.locator("[data-lang]:visible").count()) === 0, JSON.stringify(heights));
  await page.focus("#lang-button");
  await page.keyboard.press("ArrowDown");
  check("lang: arrow opens the list on the current language", await page.evaluate(() => document.activeElement?.getAttribute("data-lang") === "it" && document.getElementById("lang-button")?.getAttribute("aria-expanded") === "true"));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.dataset.langReady === "en");
  check("lang: Enter on the next language switches and gives the focus back", await page.evaluate(() => document.activeElement?.id === "lang-button" && document.getElementById("lang-button")?.textContent === "EN"));
  await page.click("#lang-button");
  await page.keyboard.press("Escape");
  check("lang: Esc closes the list", await page.evaluate(() => document.getElementById("lang-list")?.hidden === true && document.activeElement?.id === "lang-button"));
  await page.click("#lang-button");
  await page.click('[data-lang="it"]');
  await page.waitForFunction(() => document.body.dataset.langReady === "it");

  const titles = await page.$$eval(".panel-section summary", (els) => els.map((e) => e.textContent?.trim() ?? ""));
  check("panel: headers carry no numbers before the name", titles.length === 5 && titles.every((x) => /^\D/.test(x)), JSON.stringify(titles));

  const width = () => page.evaluate(() => Math.round(document.getElementById("panel").getBoundingClientRect().width));
  const w0 = await width();
  await page.focus(".panel-resize");
  await page.keyboard.press("ArrowRight");
  const w1 = await width();
  check("panel: arrow keys widen the panel", w1 === w0 + 16, `${w0} -> ${w1}`);
  const box = await page.locator(".panel-resize").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(900, box.y + 200, { steps: 5 });
  await page.mouse.up();
  const w2 = await width();
  check("panel: dragging stops at a third of the window", w2 === Math.floor(1366 / 3), String(w2));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("panel: the width is remembered", (await width()) === w2);
  await page.focus(".panel-resize");
  await page.keyboard.press("Home");
  check("panel: Home goes to the narrowest", (await width()) === 192);
  const aria = await page.getAttribute(".panel-resize", "aria-valuenow");
  check("panel: the handle exposes the width", aria === "192", String(aria));

  const stroke = (cls) => page.evaluate((c) => getComputedStyle(document.querySelector(c)).stroke, cls);
  await page.click('[data-action="demo.load"]');
  await page.waitForSelector("#chart .curve");
  check("chart: the shown spectrum is black in the light theme", (await stroke("#chart .curve")) === "rgb(0, 0, 0)", await stroke("#chart .curve"));
  await page.emulateMedia({ colorScheme: "dark" });
  check("chart: the shown spectrum is white in the dark theme", (await stroke("#chart .curve")) === "rgb(255, 255, 255)", await stroke("#chart .curve"));
  const violations = await axe(page);
  check("ritocchi: axe has no violations", violations.length === 0, violations.join(", "));
  await ctx.close();
};
