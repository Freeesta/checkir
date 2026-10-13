// Interaction e2e from the field test: arrows on the candidate rows, a click on a peak marker, the result chip legible at 320 px, Esc over a tooltip.
import { prepare } from "./picchi.mjs";
import { BETA, jcamp } from "./confronto.mjs";

/** Index of the chosen candidate row and of the row that holds the focus. */
const rows = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll(".cand-select")];
  return { chosen: all.findIndex((b) => b.getAttribute("aria-current") === "true"), focus: all.findIndex((b) => b === document.activeElement) };
});

/** ↑/↓ walk the candidates one row at a time, the focus following the chosen row. */
async function arrowsScenario(page, check) {
  await page.focus('[data-fk="cand-0"]');
  for (const [key, want] of [["ArrowDown", 1], ["ArrowDown", 2], ["ArrowUp", 1]]) {
    await page.keyboard.press(key);
    await page.waitForFunction((n) => document.querySelectorAll(".cand-select")[n]?.getAttribute("aria-current") === "true", want).catch(() => {});
    const r = await rows(page);
    check(`collaudo: ${key} reaches row ${want + 1} with the focus on it`, r.chosen === want && r.focus === want, JSON.stringify(r));
  }
}

/** A real click on a peak marker opens the peak card, as ← → do. */
async function peakClickScenario(page, check) {
  await page.keyboard.press("Escape");
  await page.focus("#chart");
  await page.keyboard.press("p");
  await page.waitForSelector("#chart .peak");
  const box = await page.locator("#chart circle.peak").nth(2).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector("#chart .peak-focus", { timeout: 3000 }).catch(() => {});
  check("collaudo: a click on a peak marker focuses that peak", (await page.locator("#chart .peak-focus").count()) === 1);
  check("collaudo: the peak card is open after the click", await page.isVisible("[data-card=close]").catch(() => false));
  const id = await page.getAttribute("#chart .peak-focus", "data-peak", { timeout: 1000 }).catch(() => null);
  const second = await page.locator("#chart circle.peak").nth(0).boundingBox();
  await page.mouse.click(second.x + second.width / 2, second.y + second.height / 2);
  await page.waitForFunction((was) => document.querySelector("#chart .peak-focus")?.getAttribute("data-peak") !== was, id, { timeout: 3000 }).catch(() => {});
  check("collaudo: a click on another marker moves the focus", id !== null && (await page.getAttribute("#chart .peak-focus", "data-peak", { timeout: 1000 }).catch(() => null)) !== id);
}

/** Esc closes the info dialog even when its button still shows a tooltip. */
async function escScenario(page, check) {
  await page.click('[data-action="info.open"]');
  await page.waitForSelector("dialog[open]");
  await page.hover('dialog [aria-label]');
  await page.waitForSelector("#tooltip:not([hidden])", { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog", { state: "detached", timeout: 3000 }).catch(() => {});
  check("collaudo: one Esc closes the dialog even with a tooltip showing", (await page.locator("dialog").count()) === 0);
  await page.mouse.move(5, 5);
}

/** At 320 px the level word in the result chip is whole, whatever the file name is. */
async function chipScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await page.setInputFiles("input[type=file]", [{ name: "un_nome_di_file_molto_lungo.jdx", mimeType: "chemical/x-jcamp-dx", buffer: jcamp("x", BETA) }]);
  await page.waitForSelector("[data-chip='result'] .chip-value");
  await page.waitForFunction(() => (document.querySelector("[data-chip='result'] .chip-value")?.textContent ?? "").length > 1 && document.body.dataset.ready === "1");
  await page.waitForFunction(() => document.querySelector(".result[data-level]") !== null, null, { timeout: 20000 });
  const m = await page.evaluate(() => {
    const v = /** @type {HTMLElement} */ (document.querySelector("[data-chip='result'] .chip-value"));
    const chip = /** @type {HTMLElement} */ (document.querySelector("[data-chip='result']")).getBoundingClientRect();
    const menu = /** @type {HTMLElement} */ (document.querySelector(".menu-button")).getBoundingClientRect();
    return { text: v.textContent, cut: v.scrollWidth - v.clientWidth + Math.max(0, chip.right - menu.left), over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check("collaudo: at 320 px the level word in the chip is not cut", m.cut <= 0 && (m.text ?? "").length > 3, JSON.stringify(m));
  check("collaudo: at 320 px the header does not scroll sideways", m.over <= 0, JSON.stringify(m));
  await ctx.close();
}

/** @param {import("playwright").Browser} browser */
export async function collaudoScenario(browser, base, check) {
  const { ctx, page, errors } = await prepare(browser, base);
  await arrowsScenario(page, check);
  await peakClickScenario(page, check);
  await escScenario(page, check);
  check("collaudo: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await chipScenario(browser, base, check);
}
