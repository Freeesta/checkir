// Resize e2e: a result with a mixture and the peaks on at 1366 px, then the window at 320 px and back: no horizontal scroll at any step, axe clean.
import { ALFA, BETA, jcamp } from "../confronto.mjs";
import { importLibrary } from "../sottrazione.mjs";

const scale = (bands, k) => bands.map(([c, h, w]) => [c, h * k, w]);
const WIDE = 1366;
const NARROW = 320;

/** Widest element reaching past the viewport (for the failure message). */
const wideOnes = (page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > w + 1 && getComputedStyle(e).position !== "fixed")
      .slice(0, 4)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${e.className?.baseVal ?? e.className}`);
  });

async function step(page, check, axe, width, label) {
  await page.setViewportSize({ width, height: width < 400 ? 640 : 768 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
  check(`resize: ${label} (${width} px) has no horizontal scroll`, m.scroll <= m.view, `${m.scroll} > ${m.view}: ${(await wideOnes(page)).join(" | ")}`);
  const chart = await page.evaluate(() => document.querySelector("#chart svg")?.getBoundingClientRect().right ?? 0);
  check(`resize: ${label} the chart fits the area`, chart <= width + 1, String(chart));
  const v = await axe(page);
  check(`resize: ${label} axe has no violations`, v.length === 0, v.join(", "));
}

export default async function resizeScenario({ browser, base, check, axe }) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: WIDE, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await importLibrary(page);
  const buffer = jcamp("campione_miscela", [...scale(BETA, 0.7), ...scale(ALFA, 0.3)]);
  await page.setInputFiles("input[type=file]", [{ name: "campione_miscela.jdx", mimeType: "chemical/x-jcamp-dx", buffer }]);
  await page.waitForSelector("[data-mixture]", { timeout: 40000 });
  await page.keyboard.press("p");
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await step(page, check, axe, WIDE, "wide");
  await step(page, check, axe, NARROW, "narrow");
  await step(page, check, axe, WIDE, "wide again");
  check("resize: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
