// Scenario run by fumo.mjs: with the library files delayed, a spinner with a hidden spoken label shows next to the title of section 2 and aria-busy is set; both go away when loading ends.
const IND = 'details[data-panel="libraries"] .load-ind';

async function once(browser, base, check, axe, { locale, scheme, width, motion, word }) {
  const tag = `libraries loading (${locale}, ${scheme}, ${width}px, ${motion})`;
  const ctx = await browser.newContext({ locale, colorScheme: scheme, reducedMotion: motion, viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  let release = () => {};
  const gate = new Promise((r) => (release = r));
  await page.route("**/librerie/libraries.json", async (route) => { await gate; await route.continue(); });
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  const section = page.locator('details[data-panel="libraries"]');
  await page.waitForFunction((s) => document.querySelector(s)?.textContent?.trim(), IND);
  const info = await page.evaluate((s) => {
    const ind = document.querySelector(s);
    const sec = ind?.closest("details");
    const visible = [...(ind?.querySelectorAll(":scope > :not(.visually-hidden)") ?? [])].map((n) => n.textContent?.trim()).join("");
    const spin = ind?.querySelector(".spinner");
    return { role: ind?.getAttribute("role"), busy: sec?.getAttribute("aria-busy"), text: ind?.textContent?.trim(), visible, running: spin?.getAnimations().filter((a) => a.playState === "running").length ?? 0 };
  }, IND);
  check(`${tag}: indicator with status role, hidden label and aria-busy`, info.role === "status" && info.busy === "true" && word.test(info.text ?? "") && info.visible === "", JSON.stringify(info));
  if (width > 700) check(`${tag}: ${motion === "reduce" ? "static" : "animated"}`, motion === "reduce" ? info.running === 0 : info.running > 0, String(info.running));
  if (width === 320 || scheme === "dark" || locale === "en-GB") {
    const violations = await axe(page);
    check(`${tag}: axe clean while loading`, violations.length === 0, violations.join(" | "));
  }
  release();
  await page.waitForFunction((s) => !document.querySelector(s)?.textContent?.trim(), IND);
  check(`${tag}: gone when loading ends`, (await section.getAttribute("aria-busy")) === "false" && (await page.locator(`${IND} .spinner`).count()) === 0);
  await ctx.close();
}

export default async ({ browser, base, check, axe }) => {
  await once(browser, base, check, axe, { locale: "it-IT", scheme: "light", width: 1280, motion: "no-preference", word: /Librerie in caricamento/ });
  await once(browser, base, check, axe, { locale: "en-GB", scheme: "dark", width: 1280, motion: "reduce", word: /Libraries loading/ });
  await once(browser, base, check, axe, { locale: "it-IT", scheme: "light", width: 320, motion: "no-preference", word: /Librerie in caricamento/ });
};
