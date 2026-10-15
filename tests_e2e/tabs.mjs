// Open tabs e2e: the pure patches of tabs.js (focus swaps the view, close, move, limits) and, in the browser, three files as three tabs, each keeping its own view,
// the residual inside its parent's tab, the keyboard and menu of the bar, the limits of the open-files budget, nothing stored and nothing restored on reload.
import { jcamp, ALFA, BETA, GAMMA } from "./confronto.mjs";

const mod = (name) => import(new URL(`../web/${name}`, import.meta.url));
const apply = (s, p) => ({ ...s, ...p });
const file = (code, parent = null, points = 10) => ({ code, parent, points, name: `${code}.jdx` });

/** The pure patches, without a browser. */
export async function tabsPureScenario(check) {
  const { emptyState, emptyView, VIEW_FIELDS } = await mod("state.js");
  const T = await mod("tabs.js");
  let s = emptyState();
  s = apply(s, { files: [file("C1")] });
  s = apply(s, T.openFilePatch(s, "C1"));
  check("tabs: the first file opens a tab with the focus and its code shown", s.tabs.length === 1 && s.focusTab === "C1" && s.active === "C1");
  s = apply(s, { selected: "lib/x", showPeaks: true, peakFocus: "p1" });
  s = apply(s, { files: [...s.files, file("C2")] });
  s = apply(s, T.openFilePatch(s, "C2"));
  check("tabs: opening a second tab saves the view of the first and starts an empty one", s.focusTab === "C2" && s.selected === null && s.showPeaks === false && s.tabs[0].view.selected === "lib/x" && s.tabs[0].view.peakFocus === "p1");
  s = apply(s, T.focusPatch(s, "C1"));
  check("tabs: going back restores the view of the first tab", s.focusTab === "C1" && s.selected === "lib/x" && s.showPeaks === true && s.peakFocus === "p1" && s.talk === false);
  check("tabs: every view field is saved and restored", VIEW_FIELDS.every((k) => k in emptyView("C9")) && emptyView("C9").active === "C9");
  s = apply(s, { files: [...s.files, file("C1-r1", "C1"), file("C1-r2", "C1-r1")] });
  check("tabs: a residual belongs to the tab of its root, also through another residual", T.rootOf(s, "C1-r2") === "C1" && T.tabOfCode(s, "C1-r2")?.id === "C1");
  s = apply(s, T.syncActive(s, "C2"));
  check("tabs: showing a spectrum of another tab moves the focus there", s.focusTab === "C2" && s.active === "C2");
  s = apply(s, T.syncActive(s, "C1-r1"));
  check("tabs: showing a residual focuses its tab with the residual shown", s.focusTab === "C1" && s.active === "C1-r1" && s.selected === "lib/x");
  s = apply(s, T.syncActive(s, "C1"));
  check("tabs: inside the focused tab only the shown spectrum changes", s.active === "C1" && s.selected === "lib/x");
  s = apply(s, { files: [...s.files, file("C3")] });
  s = apply(s, T.openFilePatch(s, "C3"));
  s = apply(s, { split: { panes: ["C1", "C2", "C3"], orientation: "row", linked: true } });
  const mid = apply(s, T.closePatch(s, "C2"));
  check("tabs: closing a tab that is not focused keeps the focus, and two panes stay", mid.focusTab === "C3" && mid.tabs.map((x) => x.id).join() === "C1,C3" && mid.split.panes.join() === "C1,C3");
  const right = apply(apply(s, T.focusPatch(s, "C2")), {});
  const closedMid = apply(right, T.closePatch(right, "C2"));
  check("tabs: closing the focused tab gives the focus to the one on its right", closedMid.focusTab === "C3" && closedMid.split.panes.join() === "C1,C3");
  const two = apply(s, { split: { panes: ["C2", "C3"], orientation: "row", linked: true } });
  const closedLast = apply(two, T.closePatch(two, "C3"));
  check("tabs: closing the last one gives the focus to the one on its left, below two panes the split ends", closedLast.focusTab === "C2" && closedLast.split.panes.length === 0);
  const solo = apply(emptyState(), { files: [file("C1")] });
  const one = apply(solo, T.openFilePatch(solo, "C1"));
  const none = apply(one, T.closePatch(one, "C1"));
  check("tabs: closing the only tab leaves no focus", none.tabs.length === 0 && none.focusTab === null && none.active === null);
  const moved = apply(s, T.movePatch(s, "C3", 0));
  check("tabs: a tab moves to a position and stops at the ends", moved.tabs.map((x) => x.id).join() === "C3,C1,C2" && T.movePatch(s, "C1", -5).tabs.map((x) => x.id).join() === "C1,C2,C3" && T.movePatch(s, "C1", 99).tabs.at(-1).id === "C1");
  const full = { ...emptyState(), tabs: Array.from({ length: T.TABS_MAX }, (_, i) => ({ id: `C${i + 1}`, kind: "file", code: `C${i + 1}`, sheet: null, view: null })) };
  check("tabs: the 21st file tab is not allowed, the 20th is", !T.canOpenFile(full) && T.canOpenFile(apply(full, { tabs: full.tabs.slice(1) })) && T.canOpenSheet(full));
  check("tabs: points in memory add up roots and residuals", T.pointsInMemory(apply(emptyState(), { files: [file("C1", null, 5), file("C1-r1", "C1", 7)] })) === 12);
  const { OPEN_BUDGET } = await mod("files.js").catch(() => ({}));
  if (OPEN_BUDGET) check("tabs: the contract is 20 tabs, 20 sheets, 4 194 304 points", OPEN_BUDGET.tabs === 20 && OPEN_BUDGET.sheets === 20 && OPEN_BUDGET.points === 4194304);
}

const upload = (page, names) => page.setInputFiles("input[type=file]", names.map(([n, b]) => ({ name: n, mimeType: "chemical/x-jcamp-dx", buffer: jcamp(n, b) })));
const st = (page, expr) => page.evaluate(async (e) => new Function("s", `return ${e}`)((await import(new URL("state.js", location.href).href)).getState()), expr);
const focusId = (page) => page.evaluate(() => document.activeElement?.id ?? "");
const announced = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status")?.textContent ?? ""), re.source).then(() => true, () => false);

/** Three files, three tabs, each with its own view; the residual stays in the tab of C1. */
async function viewsScenario(page, check) {
  await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA], ["tre.jdx", GAMMA]]);
  await page.waitForSelector("#tab-C3");
  const names = await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => b.getAttribute("aria-label")));
  check("tabs e2e: three files are three tabs named with the code and the file", names.join("|") === "Analisi C1 uno.jdx|Analisi C2 due.jdx|Analisi C3 tre.jdx", names.join("|"));
  check("tabs e2e: the last one has the focus and the panel is labelled by it", (await page.getAttribute("#tab-C3", "aria-selected")) === "true" && (await page.getAttribute("#pane-main", "aria-labelledby")) === "tab-C3");
  check("tabs e2e: the name is cut with an ellipsis and complete in the title", (await page.getAttribute("#tab-C1", "title")) === "uno.jdx" && (await page.locator("#tab-C1 .tab-name").evaluate((n) => getComputedStyle(n).textOverflow)) === "ellipsis");
  await page.click("#tab-C1");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("p");
  await page.focus("#chart");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector("#chart circle.peak-focus");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  const peak = await page.getAttribute("#chart circle.peak-focus", "data-peak");
  await page.keyboard.press("g");
  check("tabs e2e: on C1 a peak is picked and the regions are open", (await st(page, "s.rangesOpen && s.showPeaks && s.peakFocus !== null")) === true);
  await page.click("#tab-C2");
  check("tabs e2e: C2 starts with its own empty view", (await st(page, "s.active === 'C2' && !s.rangesOpen && !s.showPeaks && s.peakFocus === null")) === true && (await page.locator("#chart circle.peak-focus").count()) === 0);
  await page.click("#tab-C1");
  check("tabs e2e: back on C1 the peak and the regions are as left", (await page.getAttribute("#chart circle.peak-focus", "data-peak")) === peak && (await st(page, "s.rangesOpen && s.active === 'C1'")) === true);
  await page.evaluate(async () => {
    const f = await import(new URL("files.js", location.href).href);
    f.addResidual("C1", f.spectrumOf("C1"), { name: "ref", library: "lib", k: 1 });
  });
  check("tabs e2e: a residual stays inside the tab of C1 and opens no tab", (await page.locator("#doc-tabs [role=tab]").count()) === 3 && (await st(page, "s.files.some((f) => f.code === 'C1-r1')")) === true);
  await page.click("#tab-C3");
  await page.evaluate(async () => {
    const st = await import(new URL("state.js", location.href).href);
    const t = await import(new URL("tabs.js", location.href).href);
    st.update(t.syncActive(st.getState(), "C1-r1"));
  });
  check("tabs e2e: choosing the residual brings back the tab of C1", (await st(page, "s.focusTab === 'C1' && s.active === 'C1-r1'")) === true);
}

/** Keys of the bar: arrows, Home, End, Enter, Delete, Ctrl+Shift+arrows, the menu key, `w` and `j`, the X and the middle click. */
async function keysScenario(page, check) {
  await page.focus("#tab-C1");
  await page.keyboard.press("ArrowLeft");
  check("tabs e2e: ← from the first goes round to the last without showing it", (await focusId(page)) === "tab-C3" && (await st(page, "s.focusTab")) === "C1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  check("tabs e2e: → moves on, cyclic", (await focusId(page)) === "tab-C2");
  await page.keyboard.press("End");
  check("tabs e2e: End goes to the last", (await focusId(page)) === "tab-C3");
  await page.keyboard.press("Home");
  check("tabs e2e: Home goes to the first", (await focusId(page)) === "tab-C1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  check("tabs e2e: Enter shows the tab that has the focus", (await st(page, "s.focusTab")) === "C2" && (await page.getAttribute("#tab-C2", "tabindex")) === "0");
  await page.keyboard.press("Control+Shift+ArrowRight");
  check("tabs e2e: Ctrl+Shift+→ moves the tab and says where", (await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => b.dataset.tab).join())) === "C1,C3,C2" && (await announced(page, /C2 in posizione 3 di 3/)) && (await focusId(page)) === "tab-C2");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await page.keyboard.press("Shift+F10");
  await page.waitForSelector('[role=menu] [data-item="tab.close_others"]');
  const items = await page.locator('[role=menu] [role=menuitem]').allTextContents();
  check("tabs e2e: Shift+F10 opens the menu with its six rows", items.length === 6 && /Sposta a sinistra/.test(items[0]) && /Affianca a destra/.test(items[2]) && /Chiudi le altre/.test(items[5]), items.join("|"));
  await page.keyboard.press("Escape");
  check("tabs e2e: Esc closes the menu and the focus stays on the tab", (await page.locator("[role=menu]").count()) === 0 && (await focusId(page)) === "tab-C2");
  await page.keyboard.press("j");
  check("tabs e2e: j shows the next tab, cyclic", (await st(page, "s.focusTab")) === "C3");
  await page.click("#tabs-list");
  const listed = await page.locator("[role=menu] [role=menuitemcheckbox]").count();
  await page.locator("[role=menu] [role=menuitemcheckbox]").first().click();
  check("tabs e2e: the list holds every tab and choosing one shows it", listed === 3 && (await st(page, "s.focusTab")) === "C1");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("w");
  check("tabs e2e: w closes the focused tab and the neighbour on the right is shown", (await st(page, "s.tabs.length === 2 && s.focusTab === 'C2'")) === true);
  await page.click("#tab-C3 .tab-close");
  check("tabs e2e: a click on the X closes the tab", (await st(page, "s.tabs.length")) === 1);
  await upload(page, [["a.jdx", ALFA], ["b.jdx", BETA]]);
  await page.waitForSelector("#doc-tabs [role=tab] >> nth=2");
  await page.click("#doc-tabs [role=tab] >> nth=1", { button: "middle" });
  check("tabs e2e: a middle click closes the tab", (await st(page, "s.tabs.length")) === 2);
  await page.focus("#doc-tabs [role=tab] >> nth=0");
  await page.keyboard.press("Delete");
  check("tabs e2e: Delete closes the tab and the focus stays in the bar", (await st(page, "s.tabs.length")) === 1 && (await focusId(page)).startsWith("tab-"));
}

/** 21 files at once: the first 20 open, the rest is refused with a notice and an announcement; then the points budget. */
async function limitsScenario(browser, base, check) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await upload(page, Array.from({ length: 21 }, (_, i) => [`f${i + 1}.jdx`, ALFA]));
  await page.waitForFunction(() => document.querySelectorAll("#doc-tabs [role=tab]").length === 20);
  await page.waitForFunction(() => /almeno|massimo|aperte/i.test(document.getElementById("tabs-notice")?.textContent ?? ""));
  check("tabs limit: the 21st file is refused, 20 tabs stay", (await page.locator("#doc-tabs [role=tab]").count()) === 20 && /20 schede/.test((await page.textContent("#tabs-notice")) ?? ""));
  check("tabs limit: the refusal is announced", await announced(page, /1 file non aperti/));
  await page.click("#doc-tabs [role=tab] >> nth=19 >> .tab-close");
  await page.waitForFunction(() => document.querySelectorAll("#doc-tabs [role=tab]").length === 19);
  check("tabs limit: closing a tab clears the notice and nothing was closed by itself", ((await page.textContent("#tabs-notice")) ?? "") === "");
  const big = (n) => page.evaluate(async (len) => {
    const f = await import(new URL("files.js", location.href).href);
    return f.addSpectrum({ wavenumber_cm1: Array.from({ length: len }, (_, i) => 4000 - i * 0.001), y: new Array(len).fill(0.1), y_unit: "Absorbance" }, {});
  }, n);
  await page.evaluate(async () => (await import(new URL("files.js", location.href).href)).closeAll());
  const a = await big(1 << 21);
  const b = await big(1 << 21);
  const c = await big(10);
  check("tabs limit: two big spectra fit, a third that would pass 4 194 304 points is refused", a !== "" && b !== "" && c === "" && /memoria/.test((await page.textContent("#tabs-notice")) ?? ""));
  const stored = await page.evaluate(async () => ({ local: Object.keys(localStorage), session: sessionStorage.length, idb: (await indexedDB.databases()).length }));
  check("tabs limit: nothing is stored but preferences", stored.local.every((k) => k.startsWith("checkir.")) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  check("tabs limit: after a reload there is no tab", (await page.locator("#doc-tabs [role=tab]").count()) === 0 && (await page.isHidden("#doc-tabs")));
  await ctx.close();
}

/** Accessibility and layout: axe in light, dark and English, no sideways scroll at 320 px. */
async function viewScenario(browser, base, check, axe) {
  for (const [scheme, locale] of [["light", "it-IT"], ["dark", "it-IT"], ["light", "en-GB"]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, locale, viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForSelector("body[data-ready='1']");
    await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA]]);
    await page.waitForSelector("#tab-C2");
    const v = await axe(page);
    check(`tabs view: axe has no violations (${scheme}, ${locale})`, v.length === 0, v.join(", "));
    if (locale === "en-GB") check("tabs view: the English names", (await page.getAttribute("#tab-C1", "aria-label")) === "Analysis C1 uno.jdx" && (await page.getAttribute("#tabs-list", "aria-label")) === "List of tabs");
    await ctx.close();
  }
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await upload(page, Array.from({ length: 8 }, (_, i) => [`un_nome_di_file_molto_lungo_${i}.jdx`, ALFA]));
  await page.waitForSelector("#tab-C8");
  check("tabs view: at 320 px the page does not scroll sideways, the bar does inside itself", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector(".doc-tabs-scroll").scrollWidth > document.querySelector(".doc-tabs-scroll").clientWidth));
  const v = await axe(page);
  check("tabs view: axe is clean at 320 px with eight tabs", v.length === 0, v.join(", "));
  await ctx.close();
}

export async function tabsScenario(browser, base, check, axe) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  await viewsScenario(page, check);
  await keysScenario(page, check);
  check("tabs e2e: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await limitsScenario(browser, base, check);
  await viewScenario(browser, base, check, axe);
}
