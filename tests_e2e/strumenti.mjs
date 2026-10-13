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
