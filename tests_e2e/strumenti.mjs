// Chart instruments e2e: two reading cursors, box zoom, wheel zoom, double click, locked y axis, linked x axes, keyboard only, reduced motion, axe.
import { FIXTURE } from "./caricamento.mjs";

/** Pure view helpers and the axis link. */
async function pureScenario(check) {
  const { zoomAt, spanOf } = await import(new URL("../web/view.js", import.meta.url));
  const { createViewLink } = await import(new URL("../web/view_link.js", import.meta.url));
  const full = { min: 400, max: 4000 };
  const z = zoomAt({ min: 400, max: 4000 }, full, 0.5, 1000);
  check("tools: wheel zoom keeps the point under the pointer", Math.abs((1000 - z.min) / (z.max - z.min) - (1000 - 400) / 3600) < 1e-9 && z.max - z.min === 1800);
  const b = spanOf(full, 1800, 1600);
  check("tools: box zoom spans the two wavenumbers", b.min === 1600 && b.max === 1800);
  check("tools: a box narrower than 20 cm-1 is widened and stays inside", spanOf(full, 405, 400).min === 400 && spanOf(full, 405, 400).max - 400 === 20);
  const link = createViewLink();
  const seen = [];
  const pubA = link.join((v) => seen.push(["a", v.min]));
  link.join((v) => seen.push(["b", v.min]));
  pubA({ min: 1000, max: 2000 });
  check("tools: a linked view reaches the others, not its sender", seen.length === 1 && seen[0][0] === "b" && seen[0][1] === 1000);
}

const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const reading = async (page) => (await frames(page), page.$$eval("#chart .cursor-text", (n) => n.filter((x) => x.style.display !== "none").map((x) => x.textContent ?? "").filter(Boolean)));

/** Keyboard only: k places cursor 1 then 2, the comma moves the active one, the reading is announced, y locks, Esc clears. */
async function keyboardScenario(page, check) {
  await page.focus("#chart");
  await page.keyboard.press("k");
  let r = await reading(page);
  check("tools: k places cursor 1 with position and value", r.length === 2 && r.includes("1") && r.some((x) => /^~\d+\.\d cm⁻¹ · A -?\d+\.\d{3}$/.test(x)), r.join(" | "));
  await page.waitForFunction(() => /cm⁻¹/.test(document.getElementById("status")?.textContent ?? ""));
  const before = r.find((x) => x.startsWith("~"));
  await page.keyboard.press("k");
  await page.keyboard.press(".");
  r = await reading(page);
  check("tools: the second cursor gives the difference", r.some((x) => /^Δν̃ \d+\.\d cm⁻¹ · ΔA \d+\.\d{3}$/.test(x)) && r.includes("2"), r.join(" | "));
  check("tools: cursor 2 is dashed, cursor 1 solid", (await page.locator("#chart line.cursor-2").getAttribute("stroke-dasharray").catch(() => null)) === null && (await page.evaluate(() => getComputedStyle(document.querySelector("#chart .cursor-2")).strokeDasharray)) !== "none");
  await page.keyboard.press("Shift+,");
  check("tools: the first reading did not change while moving cursor 2", (await reading(page)).includes(before));
  await page.keyboard.press("Escape");
  check("tools: Esc removes the cursors", (await reading(page)).length === 0);
  const ticks = () => page.$$eval("#chart text.label", (n) => n.slice(0, 40).map((x) => x.textContent).join(","));
  await page.keyboard.press("y");
  check("tools: y locks the y axis", (await page.getAttribute("#chart-toolbar button:last-child", "aria-pressed")) === "true");
  const locked = await ticks();
  await page.keyboard.press("+");
  const yTicks = (s) => s.split(",").filter((x) => /^-?\d+\.\d$/.test(x)).join(",");
  check("tools: with y locked a zoom leaves the y ticks alone", yTicks(await ticks()) === yTicks(locked));
  await page.keyboard.press("y");
  await page.keyboard.press("0");
}

/** Mouse: click, box zoom, wheel zoom, double click. */
async function pointerScenario(page, check) {
  const box = await page.locator("#chart svg").boundingBox();
  const at = (f) => ({ x: box.x + box.width * f, y: box.y + box.height * 0.5 });
  const full = await page.textContent("#range");
  await page.mouse.click(at(0.5).x, at(0.5).y);
  check("tools: a click places cursor 1", (await reading(page)).includes("1"));
  await page.mouse.move(at(0.3).x, at(0.5).y);
  await page.mouse.down();
  await page.mouse.move(at(0.5).x, at(0.5).y, { steps: 4 });
  check("tools: dragging shows the zoom box", await page.isVisible("#chart rect.zoom-box"));
  await page.mouse.up();
  const zoomed = await page.textContent("#range");
  check("tools: the box zooms to its range", zoomed !== full && !(await page.isVisible("#chart rect.zoom-box")), `${full} -> ${zoomed}`);
  await page.mouse.dblclick(at(0.5).x, at(0.5).y);
  check("tools: a double click shows the whole spectrum", (await page.textContent("#range")) === full);
  await page.mouse.move(at(0.5).x, at(0.5).y);
  await page.mouse.wheel(0, -300);
  await page.waitForFunction((f) => document.getElementById("range")?.textContent !== f, full);
  check("tools: the wheel zooms", (await page.textContent("#range")) !== full);
  await page.keyboard.press("0");
}

const yTicksOf = (page) => page.$$eval("#chart text.label", (n) => n.map((x) => x.textContent ?? "").filter((x) => /^-?\d+\.\d$/.test(x)).join(","));

/** Drag along the axes zooms that range; the y axis only when it is not locked. */
async function axisScenario(page, check) {
  const box = await page.locator("#chart svg").boundingBox();
  const at = (sx, sy) => ({ x: box.x + (box.width * sx) / 800, y: box.y + (box.height * sy) / 360 });
  const drag = async (a, b) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
  };
  const full = await page.textContent("#range");
  await drag(at(300, 340), at(500, 340));
  check("tools: dragging along the x axis zooms that range", (await page.textContent("#range")) !== full);
  await page.mouse.dblclick(at(400, 150).x, at(400, 150).y);
  await page.keyboard.press("b");
  check("tools: b goes back to the previous view", (await page.textContent("#range")) !== full);
  await page.mouse.dblclick(at(400, 150).x, at(400, 150).y);
  const ticks = await yTicksOf(page);
  await drag(at(30, 250), at(30, 120));
  const zoomedY = await yTicksOf(page);
  check("tools: dragging along the y axis zooms the y range", zoomedY !== ticks, `${ticks} -> ${zoomedY}`);
  await page.mouse.dblclick(at(400, 150).x, at(400, 150).y);
  check("tools: a double click brings the y axis back", (await yTicksOf(page)) === ticks);
  await page.focus("#chart");
  await page.keyboard.press("Shift+ArrowUp");
  check("tools: Shift+ArrowUp zooms y from the keyboard", (await yTicksOf(page)) !== ticks);
  await page.keyboard.press("0");
  await page.mouse.dblclick(at(400, 150).x, at(400, 150).y);
  await page.keyboard.press("y");
  await drag(at(30, 250), at(30, 120));
  check("tools: with y locked the y axis does not zoom and says so", (await yTicksOf(page)) === ticks && (await page.waitForFunction(() => /bloccato/.test(document.getElementById("status")?.textContent ?? "")).then(() => true)));
  await page.keyboard.press("y");
}

/** The chart menu: right click, Menu key and Shift+F10, rows, check marks, Escape, the browser menu left alone elsewhere, the CSV. */
async function menuScenario(page, check, axe) {
  const box = await page.locator("#chart svg").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await page.waitForSelector('[role="menu"]');
  const items = await page.$$eval('[role="menu"] button', (b) => b.map((x) => x.dataset.item));
  check("tools: right click opens the chart menu with its rows", items.length === 9 && items.includes("y.lock") && items.includes("table.export") && items.includes("peaks.toggle"), items.join(","));
  check("tools: the first row has the focus", await page.evaluate(() => document.activeElement?.closest('[role="menu"]') !== null));
  const violations = await axe(page);
  check("tools: axe has no violations with the menu open", violations.length === 0, violations.join(", "));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  check("tools: Escape closes the menu and gives the focus back to the chart", !(await page.isVisible('[role="menu"]')) && (await page.evaluate(() => document.activeElement?.id)) === "chart");
  await page.keyboard.press("Shift+F10");
  await page.waitForSelector('[role="menu"]');
  check("tools: Shift+F10 opens it from the keyboard", true);
  await page.click('[data-item="y.lock"]');
  check("tools: a check row shows its state", (await page.getAttribute("#chart-toolbar button:last-child", "aria-pressed")) === "true");
  await page.keyboard.press("ContextMenu");
  await page.waitForSelector('[role="menu"]');
  check("tools: the checked row is marked", (await page.getAttribute('[data-item="y.lock"]', "aria-checked")) === "true");
  await page.click('[data-item="y.lock"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Shift+F10").then(() => page.click('[data-item="table.export"]'))]);
  const lines = (await (await import("node:fs/promises")).readFile(await download.path(), "utf8")).split("\n");
  check("tools: the CSV is named by the code and holds only the sample", download.suggestedFilename() === "C1.csv" && lines[0] === "wavenumber_cm1,absorbance" && /^\d+(\.\d+)?,-?[\d.e-]+$/.test(lines[1]), download.suggestedFilename() + " " + lines[0]);
  check("tools: outside the chart the browser's own menu is left alone", await page.evaluate(() => { const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.getElementById("range")?.dispatchEvent(e); return !e.defaultPrevented; }));
}

/** @param {import("playwright").Browser} browser @param {string} base */
export async function toolsScenario(browser, base, check, axe) {
  await pureScenario(check);
  for (const [scheme, locale] of [["light", "it-IT"], ["dark", "en-US"]]) {
    const ctx = await browser.newContext({ locale, colorScheme: scheme, reducedMotion: "reduce", viewport: { width: scheme === "light" ? 1366 : 320, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
    await page.setInputFiles("input[type=file]", FIXTURE.pathname);
    await page.waitForSelector("#chart polyline.curve");
    if (scheme === "light") {
      await keyboardScenario(page, check);
      await pointerScenario(page, check);
      await axisScenario(page, check);
      await menuScenario(page, check, axe);
    }
    await page.focus("#chart");
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    check(`tools [${scheme}]: reduced motion, no animation or transition running`, (await page.evaluate(() => document.getAnimations().length)) === 0);
    check(`tools [${scheme}]: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    const violations = await axe(page);
    check(`tools [${scheme}]: axe has no violations with the cursors on`, violations.length === 0, violations.join(", "));
    await ctx.close();
  }
}
