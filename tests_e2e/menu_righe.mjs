// Picture export (SVG, PNG), copy of the values at the cursor and the context menus of the rows (candidate, peak, region). Waits are on state: file, clipboard, DOM.
import { openPanel, prepare } from "./richiamo.mjs";
import { readFile } from "node:fs/promises";

const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

async function copied(page, pattern) {
  await page.waitForFunction(async (src) => new RegExp(src).test(await navigator.clipboard.readText()), pattern.source, { timeout: 5000 }).catch(() => {});
  return clipboard(page);
}

async function picturesScenario(page, check) {
  const grab = async (item) => {
    await page.click("#chart", { button: "right", position: { x: 300, y: 120 } });
    const [d] = await Promise.all([page.waitForEvent("download"), page.click(`[data-item="${item}"]`)]);
    return [d.suggestedFilename(), await readFile(await d.path())];
  };
  const [svgName, svgBytes] = await grab("export.svg");
  const svg = svgBytes.toString("utf8");
  check("picture: the menu exports the chart as C1.svg, stand alone", svgName === "C1.svg" && /^<\?xml[^>]*>\s*<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg) && /<polyline/.test(svg), svg.slice(0, 160));
  check("picture: the SVG has its colours inline, no variable, no cursor areas, no original file name", !/var\(--/.test(svg) && !/axis-hit|zoom-box/.test(svg) && /stroke:\s*rgb/.test(svg) && !/campione/.test(svgName + svg));
  const [pngName, png] = await grab("export.png");
  check("picture: the menu exports the chart as C1.png, a real PNG of twice the size", pngName === "C1.png" && png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) >= 1200 && png.length > 2000, `${pngName} ${png.length}`);
}

async function cursorScenario(page, check) {
  await page.click("#chart", { button: "right", position: { x: 300, y: 120 } });
  await page.click('[data-item="cursor.1"]');
  await page.click("#chart", { button: "right", position: { x: 500, y: 120 } });
  await page.click('[data-item="cursor.2"]');
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("v");
  const text = await copied(page, /^\d+\.\d\t-?\d+\.\d{3}\n\d+\.\d\t-?\d+\.\d{3}$/);
  check("copy: v puts wavenumber and absorbance of both cursors in the clipboard, decimal point", /^\d+\.\d\t-?\d+\.\d{3}\n\d+\.\d\t-?\d+\.\d{3}$/.test(text), JSON.stringify(text));
  await page.click("#chart", { button: "right", position: { x: 300, y: 120 } });
  check("copy: the menu lists the copy with its key", (await page.locator('[data-item="cursor.copy"] .menu-key').textContent()) === "v");
  await page.keyboard.press("Escape");
}

async function candidateScenario(page, check) {
  await page.evaluate(() => navigator.clipboard.writeText(""));
  const row = page.locator("#candidates li.cand").first();
  await row.click({ button: "right" });
  const items = await page.$$eval('[role="menu"] [data-item]', (n) => n.map((x) => x.dataset.item));
  check("rowmenu: a candidate row has compare, sheet, recall and copy", ["cand.compare", "cand.sheet", "cand.recall", "cand.copy"].every((i) => items.includes(i)), items.join(","));
  await page.click('[data-item="cand.copy"]');
  const text = await copied(page, /^1\tbeta/);
  check("rowmenu: copy gives rank, name, form, library, r and coverage with a decimal point", /^1\tbeta\t[^\t]*\t[^\t]*\t\d\.\d\d\t\d+$/.test(text), JSON.stringify(text));
  await row.click({ button: "right" });
  await page.click('[data-item="cand.recall"]');
  await page.waitForSelector("#recall:not([hidden]) .recall-item");
  check("rowmenu: recall puts the candidate in the comparison", (await page.locator(".recall-item").count()) === 1 && /beta/i.test((await page.textContent(".recall-item")) ?? ""));
  await page.locator("#candidates li.cand").nth(1).click({ button: "right" });
  await page.click('[data-item="cand.sheet"]');
  await page.waitForFunction(() => document.querySelector('details[data-panel="sheet"]')?.open === true);
  check("rowmenu: open the sheet chooses the row and opens section 5", (await page.locator("#candidates li.cand").nth(1).getAttribute("data-key")) === (await page.locator('#candidates .cand-select[aria-current="true"]').first().evaluate((b) => b.closest(".cand")?.getAttribute("data-key"))));
  await page.locator("#candidates .cand-select").first().focus();
  await page.keyboard.press("Shift+F10");
  check("rowmenu: Shift+F10 on the focused row opens the same menu and Esc gives the focus back", (await page.locator('[role="menu"] [data-item="cand.copy"]').count()) === 1 && (await page.keyboard.press("Escape"), await page.locator('#candidates .cand-select[data-fk="cand-0"]').evaluate((b) => b === document.activeElement)));
}

async function peakScenario(page, check) {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("p");
  await openPanel(page, "peaks");
  await page.waitForSelector(".peak-item");
  await page.evaluate(() => navigator.clipboard.writeText(""));
  const peak = page.locator(".peak-item").first();
  await peak.click({ button: "right" });
  await page.click('[data-item="peak.copy"]');
  const text = await copied(page, /^\d+\.\d\t/);
  check("rowmenu: peak copy gives position and intensity", /^\d+\.\d\t(strong|medium|weak)$/.test(text), JSON.stringify(text));
  await peak.click({ button: "right" });
  await page.click('[data-item="peak.pick"]');
  await page.waitForFunction(() => document.querySelector(".peak-item")?.getAttribute("aria-pressed") === "true");
  check("rowmenu: pick the peak selects it", (await peak.getAttribute("aria-pressed")) === "true");
  await peak.click({ button: "right" });
  await page.click('[data-item="peak.inverse"]');
  await page.waitForSelector("dialog[open]");
  check("rowmenu: search the band opens the inverse search", await page.isVisible("dialog[open]"));
  await page.keyboard.press("Escape");
  const region = page.locator(".region-item[data-from]").first();
  await region.click({ button: "right" });
  await page.click('[data-item="region.copy"]');
  const range = await copied(page, /^\d+\t\d+$/);
  check("rowmenu: region copy gives the two limits", /^\d+\t\d+$/.test(range), JSON.stringify(range));
  await region.click({ button: "right" });
  await page.click('[data-item="region.range"]');
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("g");
  await page.waitForSelector('[data-fk="range-from-0"]');
  const got = [await page.inputValue('[data-fk="range-from-0"]'), await page.inputValue('[data-fk="range-to-0"]')].sort();
  check("rowmenu: use the region as range adds a comparison range with the region's limits", JSON.stringify(got) === JSON.stringify(range.split("\t").sort()), `${got} vs ${range}`);
}

export async function rowMenuScenario(browser, base, check, axe) {
  const { ctx, page } = await prepare(browser, base);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  await picturesScenario(page, check);
  await cursorScenario(page, check);
  await candidateScenario(page, check);
  await peakScenario(page, check);
  const violations = await axe(page);
  check("rowmenu: axe has no violations", violations.length === 0, violations.join(", "));
  await ctx.close();
}
