// Layout pass e2e: chart width, regions strip, coverage bar, sheet head, phone header, test bar, panel that follows the step. Waits on state, never on time.
import { BETA, GAMMA, ALFA, ALFA_BIS, jcamp } from "./confronto.mjs";

const BETA_PLUS = [...BETA, [2650, 0.5, 12]];

/** Library of four synthetic spectra, then the sample; resolves when the result is shown. */
async function loadResult(page) {
  await page.goto(page.__base);
  await page.waitForSelector("body[data-ready='1']");
  if (page.viewportSize().width <= 720) await page.click("#tabbar [data-goto='libraries']");
  else if (!(await page.locator('details[data-panel="libraries"]').evaluate((d) => d.open))) await page.locator('details[data-panel="libraries"] summary').click();
  await page.getByRole("checkbox", { name: /checkir-community/ }).uncheck();
  await page.fill("#lib-name", "Sintetica");
  const file = (name, bands) => ({ name: `${name}.jdx`, mimeType: "application/octet-stream", buffer: jcamp(name, bands) });
  await page.setInputFiles('input[data-library="files"]', [file("alfa", ALFA), file("beta", BETA), file("gamma", GAMMA), file("alfa_bis", ALFA_BIS)]);
  await page.waitForFunction(() => /4/.test(document.querySelector('[data-library="sintetica"]')?.textContent ?? ""));
  await page.setInputFiles("input[type=file]", [file("campione", BETA_PLUS)]);
  await page.waitForSelector(".result[data-level]", { timeout: 20000 });
}

/** Wide window: full-width chart within 44 % of the height, coverage only when partial, regions strip, sheet head without logo, panel follows, test bar apart. */
async function wideScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.__base = base;
  await loadResult(page);
  const open = await page.evaluate(() => [...document.querySelectorAll("details[data-panel][open]")].map((d) => d.getAttribute("data-panel")));
  check("layout: E5 after the result the libraries section is closed and the results one is open", !open.includes("libraries") && open.includes("results"), open.join(","));
  const box = await page.evaluate(() => {
    const host = document.querySelector("#chart");
    const svg = host?.querySelector("svg");
    const vb = svg?.viewBox.baseVal;
    return { host: host?.clientWidth ?? 0, svgW: svg?.getBoundingClientRect().width ?? 0, svgH: svg?.getBoundingClientRect().height ?? 0, vbW: vb?.width ?? 0 };
  });
  check("layout: D11 the chart fills the width of its area", box.host > 700 && box.svgW >= box.host - 2 && Math.abs(box.vbW - box.host) <= 2, JSON.stringify(box));
  check("layout: D11 the chart stays within 44 % of the window height", box.svgH <= 768 * 0.44 + 1, JSON.stringify(box));
  const meters = await page.evaluate(() => ({ rows: document.querySelectorAll(".candidates .cand").length, meters: [...document.querySelectorAll(".candidates .cand meter")].map((m) => m.value), none: document.querySelectorAll(".candidates .cov-none").length }));
  check("layout: D12 a full coverage bar is not drawn, a partial one is", meters.rows > 0 && meters.meters.every((v) => v < 0.995) && meters.meters.length + meters.none === meters.rows, JSON.stringify(meters));
  await page.keyboard.press("p");
  await page.waitForSelector("#chart rect.region-band");
  const bands = await page.evaluate(() => {
    const plain = (/** @type {SVGGraphicsElement} */ n) => { const b = n.getBBox(); return { y: b.y, height: b.height }; };
    const plot = document.querySelector("#chart rect.axis");
    const rects = [...document.querySelectorAll("#chart rect.region-band")].map(plain);
    const labels = [...document.querySelectorAll("#chart text.region-label")].map(plain);
    return { plotBottom: plot ? plain(plot).y + plain(plot).height : 0, rects, labels };
  });
  const lowest = Math.min(...bands.rects.map((r) => r.y));
  check("layout: D13 regions form a strip at the foot of the plot, not full-height bands", bands.rects.length === 10 && bands.rects.every((r) => r.height <= 14 && r.y + r.height <= bands.plotBottom + 0.5) && bands.plotBottom - lowest <= 14 * 5, JSON.stringify({ lowest, bottom: bands.plotBottom }));
  check("layout: D13 each region label sits inside the strip", bands.labels.every((l) => l.y >= lowest - 1 && l.y + l.height <= bands.plotBottom + 1));
  await page.keyboard.press("s");
  await page.waitForSelector("#sheet-host .sheet-head", { state: "attached" });
  check("layout: D17 the sheet head has no logo with the check mark", (await page.locator("#sheet-host .sheet-head .logo").count()) === 0);
  if (await page.locator(".dev-bar").count()) {
    const overlap = await page.evaluate(() => {
      const bar = document.querySelector(".dev-bar")?.getBoundingClientRect();
      if (!bar) return 0;
      return [...document.querySelectorAll(".candidates .cand, #chart, .panel")].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top; }).length;
    });
    check("layout: D16 the test bar does not cover the candidates, the chart or the panel", overlap === 0, String(overlap));
  }
  await ctx.close();
}

/** Phone: the level of the result is read in full in the header chip. */
async function phoneScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  page.__base = base;
  await loadResult(page);
  await page.waitForSelector('.chip[data-chip="result"] .chip-value');
  const chip = await page.evaluate(() => {
    const v = document.querySelector('.chip[data-chip="result"] .chip-value');
    const c = document.querySelector('.chip[data-chip="result"]')?.getBoundingClientRect();
    return { cut: v ? v.scrollWidth - v.clientWidth : 99, text: v?.textContent ?? "", inside: c ? c.right <= window.innerWidth && c.left >= 0 : false, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check("layout: D6 at 320 px the level in the result chip is whole and visible", chip.cut <= 0 && chip.inside && chip.scroll <= 0 && chip.text.length > 3 && !chip.text.includes("…"), JSON.stringify(chip));
  // With a wider font and the "region" mark on the result chip the chips still stop before the menu button and the page does not scroll sideways.
  await page.keyboard.press("g");
  await page.focus('[data-fk="range-new-from"]');
  await page.keyboard.type("650");
  await page.keyboard.press("Tab");
  await page.keyboard.type("1800");
  await page.keyboard.press("Tab");
  await page.focus('[data-fk="range-add"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector('.chip[data-chip="result"] [data-chip-region]');
  await page.evaluate(() => document.documentElement.style.setProperty("font-family", '"DejaVu Sans"', "important"));
  const fit = await page.evaluate(() => {
    const chips = document.querySelector(".chips")?.getBoundingClientRect();
    const menu = document.querySelector(".menu-button")?.getBoundingClientRect();
    return { gap: menu && chips ? menu.left - chips.right : -99, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check("layout: D6 at 320 px with a wide font the chips end before the menu and nothing scrolls sideways", fit.gap >= 0 && fit.scroll <= 0, JSON.stringify(fit));
  await ctx.close();
}

/** @param {import("playwright").Browser} browser */
export async function collaudoCScenario(browser, base, check) {
  await wideScenario(browser, base, check);
  await phoneScenario(browser, base, check);
}
