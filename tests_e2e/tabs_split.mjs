// Side-by-side view e2e: the pure grid and patches of panes.js and, in the browser, two files side by side (keyboard, menu, linked x axis, "Work here", a picked peak that survives),
// dragging a tab with the mouse and with touch (long press; a short scroll does not drag), four panes in 2×2 and the fifth replacing, closing, 900 px and 320 px, axe, no network, nothing stored.
import { jcamp, ALFA, BETA, GAMMA } from "./confronto.mjs";

const mod = (name) => import(new URL(`../web/${name}`, import.meta.url));
const apply = (s, p) => ({ ...s, ...p });

/** The grid for 1-4 panes at 320, 600, 800, 1366 and 1920 px, and the patches, without a browser. */
export async function splitPureScenario(check) {
  const P = await mod("panes.js");
  const { emptyState } = await mod("state.js");
  const T = await mod("tabs.js");
  const em = (px) => px / 16;
  const lay = (n, o, px) => P.paneLayout(n, o, em(px));
  check("split: PANES_MAX is 4", P.PANES_MAX === 4);
  check("split: at 320 and 600 px one pane is visible whatever the count", [1, 2, 3, 4].every((n) => lay(n, "row", 320).visible === 1 && lay(n, "column", 600).visible === 1));
  check("split: at 800 px a column of at most two", [1, 2, 3, 4].every((n) => { const l = lay(n, "row", 800); return l.cols === 1 && l.visible === Math.min(n, 2) && l.rows === l.visible; }));
  const two = lay(2, "row", 1366);
  const col = lay(2, "column", 1366);
  check("split: at 1366 px two panes go in a row or in a column as chosen", two.cols === 2 && two.rows === 1 && col.cols === 1 && col.rows === 2);
  const three = lay(3, "row", 1366);
  check("split: three panes at 1366 px are two above and one below, at 1920 px three columns", three.cols === 2 && three.rows === 2 && three.visible === 3 && lay(3, "row", 1920).cols === 3 && lay(3, "row", 1599).cols === 2 && lay(3, "row", 1600).cols === 3);
  check("split: four panes are a 2×2 grid, never more than four", [1366, 1920].every((px) => { const l = lay(4, "row", px); return l.cols === 2 && l.rows === 2 && l.visible === 4; }) && lay(9, "row", 1920).visible === 4);
  check("split: the visible panes are a run of neighbours with the focused one", P.visiblePanes(["a", "b", "c", "d"], "d", 2).join() === "c,d" && P.visiblePanes(["a", "b", "c", "d"], "a", 1).join() === "a" && P.visiblePanes(["a", "b"], "b", 2).join() === "a,b");
  const tab = (id) => ({ id, kind: "file", code: id, sheet: null, view: null });
  const files = ["C1", "C2", "C3", "C4", "C5"].map((code) => ({ code, parent: null, points: 10, name: `${code}.jdx` }));
  let s = apply(emptyState(), { files, tabs: ["C1", "C2", "C3", "C4", "C5"].map(tab), focusTab: "C1", active: "C1" });
  const right = apply(s, P.splitPatch(s, "C2", "right"));
  check("split: a tab put on the right sits after the focused one, in a row, and the focus stays", right.split.panes.join() === "C1,C2" && right.split.orientation === "row" && right.focusTab === "C1");
  check("split: on the left it goes before, below it is a column", P.splitPatch(s, "C2", "left").split.panes.join() === "C2,C1" && P.splitPatch(s, "C2", "bottom").split.orientation === "column" && P.splitPatch(s, "C2", "top").split.panes.join() === "C2,C1");
  check("split: the focused tab beside itself uses the nearest other tab, and in the centre of itself does nothing", P.splitPatch(s, "C1", "right").split.panes.join() === "C1,C2" && Object.keys(P.splitPatch(s, "C1", "center")).length === 0);
  const three2 = apply(right, P.splitPatch(right, "C3", "right", "C2"));
  check("split: a third pane goes beside the one named", three2.split.panes.join() === "C1,C2,C3");
  const moved = apply(three2, P.splitPatch(three2, "C3", "left", "C1"));
  check("split: a tab that is already shown moves", moved.split.panes.join() === "C3,C1,C2");
  const swapped = apply(three2, P.splitPatch(three2, "C3", "center", "C1"));
  check("split: the centre of a pane shown elsewhere swaps the two, the focus follows when the focused pane goes", swapped.split.panes.join() === "C3,C2,C1" && swapped.focusTab === "C1");
  const four = apply(three2, P.splitPatch(three2, "C4", "right", "C3"));
  const five = apply(four, P.splitPatch(four, "C5", "right", "C3"));
  check("split: with four panes the drop replaces the pane under the pointer", four.split.panes.length === 4 && five.split.panes.join() === "C1,C2,C5,C4");
  const replaceFocus = apply(four, P.splitPatch(four, "C5", "center", "C1"));
  check("split: replacing the focused pane gives the focus to the new one", replaceFocus.split.panes.join() === "C5,C2,C3,C4" && replaceFocus.focusTab === "C5");
  const out = apply(three2, P.unsplitPatch(three2, "C3"));
  const alone = apply(right, P.unsplitPatch(right, "C2"));
  check("split: taking a pane away keeps the tab, below two panes the view ends", out.split.panes.join() === "C1,C2" && out.tabs.length === 5 && alone.split.panes.length === 0);
  const gone = apply(right, P.unsplitPatch(right, "C1"));
  check("split: taking the focused pane away moves the focus to its neighbour", gone.focusTab === "C2" && gone.split.panes.length === 0);
  check("split: opening a file replaces the focused pane of the view", apply(right, T.focusPatch(right, "C4")).split.panes.join() === "C4,C2");
  check("split: ending the view leaves every tab", apply(three2, P.endSplitPatch(three2)).split.panes.length === 0);
  const view = { selected: "lib/x" };
  check("split: the state of a pane is the state with the view of its tab", P.paneState(s, { ...tab("C2"), view }).selected === "lib/x" && P.paneState(s, tab("C2")).selected === s.selected);
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  check("split: the five drop zones", ["left:10,50", "right:90,50", "top:50,10", "bottom:50,90", "center:50,50"].every((c) => { const [side, xy] = c.split(":"); const [x, y] = xy.split(",").map(Number); return P.dropSide(rect, x, y) === side; }) && P.dropSide(rect, 150, 50) === null);
}

const upload = (page, names) => page.setInputFiles("input[type=file]", names.map(([n, b]) => ({ name: n, mimeType: "chemical/x-jcamp-dx", buffer: jcamp(n, b) })));
const st = (page, expr) => page.evaluate(async (e) => new Function("s", `return ${e}`)((await import(new URL("state.js", location.href).href)).getState()), expr);
const fresh = async (browser, base, opts = {}) => {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1366, height: 768 }, ...opts });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector("body[data-ready='1']");
  return { ctx, page, requests, errors };
};
const rect = (page, sel) => page.locator(sel).first().boundingBox();

/** Two files side by side from the keyboard: two panels, two charts, two tables, the linked axis, "Work here" and the picked peak. */
async function sideBySideScenario(page, check) {
  await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA]]);
  await page.waitForSelector("#tab-C2");
  await page.click("#tab-C1");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("p");
  await page.focus("#chart");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector("#chart circle.peak-focus");
  const peak = await page.getAttribute("#chart circle.peak-focus", "data-peak");
  await page.focus("#tab-C2");
  await page.keyboard.press("Shift+F10");
  await page.waitForSelector('[role=menu] [data-item="tab.split_right"]');
  const rows = await page.locator("[role=menu] [role=menuitem]").allTextContents();
  check("split e2e: the menu of a tab has the two side-by-side rows", rows.some((r) => /Affianca a destra/.test(r)) && rows.some((r) => /Affianca sotto/.test(r)) && !rows.some((r) => /Togli dalla vista/.test(r)), rows.join("|"));
  await page.focus('[role=menu] [data-item="tab.split_right"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector("#panes[data-split='2']");
  await page.waitForSelector(".pane-chart svg");
  const counts = await page.evaluate(() => ({ panels: document.querySelectorAll("#panes > .split-pane[role=tabpanel]").length, charts: document.querySelectorAll("#panes svg[role=img]").length, tables: document.querySelectorAll("#table table").length >= 1 ? document.querySelectorAll(".pane-table table").length + 1 : 0, c1: document.getElementById("panebox-C1")?.getAttribute("aria-labelledby"), c2: document.getElementById("panebox-C2")?.getAttribute("aria-labelledby") }));
  check("split e2e: two tab panels, each named by its tab, two charts and two tables", counts.panels === 2 && counts.charts === 2 && counts.tables === 2 && counts.c1 === "tab-C1" && counts.c2 === "tab-C2", JSON.stringify(counts));
  check("split e2e: the tabs say they are in the view and the panel of the work area is not a second tabpanel", (await page.getAttribute("#tab-C2", "aria-label")) === "Analisi C2 due.jdx, in vista affiancata" && (await page.getAttribute("#pane-main", "role")) === null && (await page.locator("#panebox-C1 #pane-main").count()) === 1);
  check("split e2e: the pane of C2 does not use the class of the work area candidates", (await page.locator("#main-content .cand").count()) === (await page.locator("#panebox-C1 .cand").count()));
  const before = await page.textContent("#range");
  await page.focus("#chart");
  await page.keyboard.press("+");
  const zoomed = await page.textContent("#range");
  check("split e2e: zooming the main chart zooms the other one to the same view", zoomed !== before && (await page.textContent(".pane-range")) === zoomed, `${before} → ${zoomed} / ${await page.textContent(".pane-range")}`);
  await page.click('[data-split="link"]');
  check("split e2e: the link button is a pressed toggle, off now", (await page.getAttribute('[data-split="link"]', "aria-pressed")) === "false" && (await st(page, "s.split.linked")) === false);
  await page.focus("#chart");
  await page.keyboard.press("+");
  check("split e2e: with the link off the views are independent", (await page.textContent("#range")) !== (await page.textContent(".pane-range")));
  await page.click('[data-split="link"]');
  await page.focus(".pane-chart");
  await page.keyboard.press("0");
  check("split e2e: with the link on again, resetting the light chart resets the main one", (await page.textContent("#range")) === (await page.textContent(".pane-range")));
  const left = await rect(page, "#panebox-C1");
  await page.click("#panebox-C2 .pane-work");
  const after = await rect(page, "#panebox-C1");
  check("split e2e: Work here moves the work area into the pane of C2 and the boxes keep their places", (await page.locator("#panebox-C2 #pane-main").count()) === 1 && (await page.locator("#chart").count()) === 1 && Math.abs(after.x - left.x) < 1 && (await rect(page, "#panebox-C2")).x > after.x && (await page.evaluate(() => document.activeElement?.id)) === "chart" && (await st(page, "s.focusTab")) === "C2");
  check("split e2e: the picked peak of C1 shows in its light pane meanwhile", (await page.getAttribute("#panebox-C1 .pane-chart circle.peak-focus", "data-peak")) === peak);
  await page.click("#panebox-C1 .pane-work");
  check("split e2e: back in C1 the picked peak is the same", (await page.getAttribute("#chart circle.peak-focus", "data-peak")) === peak && (await st(page, "s.focusTab")) === "C1");
}

/** Closing a tab that is in the view, taking a pane away and ending the view. */
async function closeScenario(page, check) {
  await upload(page, [["tre.jdx", GAMMA]]);
  await page.waitForSelector("#tab-C3");
  check("split e2e: opening a file in the view replaces the focused pane", (await st(page, "s.split.panes.join()")) === "C3,C2" && (await st(page, "s.focusTab")) === "C3");
  await page.click("#tab-C1 .tab-close");
  check("split e2e: closing a tab that is not in the view keeps the view", (await st(page, "s.split.panes.join()")) === "C3,C2" && (await page.locator("#panes > .split-pane").count()) === 2);
  await page.focus("#tab-C2");
  await page.keyboard.press("Shift+F10");
  await page.click('[role=menu] [data-item="tab.unsplit"]');
  await page.waitForFunction(() => !document.getElementById("panes").dataset.split);
  check("split e2e: taking a pane away ends the view of two, the tab stays and the work area is back as it was", (await page.locator("#doc-tabs [role=tab]").count()) === 2 && (await page.getAttribute("#pane-main", "role")) === "tabpanel" && (await page.locator("#panes > #pane-main").count()) === 1 && (await page.locator("#split-bar").count()) === 0);
}

/** Four panes in a 2×2 grid, the fifth tab replaces the one under the pointer, closing tabs in the view. */
async function gridScenario(browser, base, check) {
  const { ctx, page, errors } = await fresh(browser, base);
  await upload(page, [1, 2, 3, 4].map((i) => [`f${i}.jdx`, [ALFA, BETA, GAMMA, ALFA][i - 1]]));
  await page.waitForSelector("#tab-C4");
  await page.evaluate(async () => {
    const s = await import(new URL("state.js", location.href).href);
    const p = await import(new URL("panes.js", location.href).href);
    const t = await import(new URL("tabs.js", location.href).href);
    s.update(t.focusPatch(s.getState(), "C1"));
    for (const [id, target] of [["C2", "C1"], ["C3", "C2"], ["C4", "C3"]]) s.update(p.splitPatch(s.getState(), id, "right", target));
  });
  await page.waitForSelector("#panes[data-split='4'] .split-pane:not([hidden]) >> nth=3");
  const boxes = await page.locator("#panes > .split-pane").evaluateAll((l) => l.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
  const xs = new Set(boxes.map((b) => b[0]));
  const ys = new Set(boxes.map((b) => b[1]));
  check("split e2e: four panes are a 2×2 grid", boxes.length === 4 && xs.size === 2 && ys.size === 2, JSON.stringify(boxes));
  check("split e2e: the pane charts stay inside their boxes", await page.evaluate(() => [...document.querySelectorAll(".split-pane")].every((b) => b.scrollWidth <= b.clientWidth + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await upload(page, [["cinque.jdx", BETA]]);
  await page.waitForSelector("#tab-C5");
  const target = await rect(page, "#panebox-C3");
  const from = await rect(page, "#tab-C1");
  await dragTo(page, from, target.x + target.width * 0.9, target.y + target.height / 2);
  const panes = await st(page, "s.split.panes.join()");
  check("split e2e: the fifth tab dropped on a pane replaces it", (await st(page, "s.split.panes.length")) === 4 && panes.includes("C1") && !panes.includes("C3"), panes);
  check("split e2e: the replacement is announced as shown in the pane", await page.waitForFunction(() => /C1 mostrata in questo riquadro/.test(document.getElementById("status").textContent)).then(() => true, () => false));
  await page.click("#tab-C2 .tab-close");
  check("split e2e: closing a tab of the view leaves three panes", (await st(page, "s.split.panes.length")) === 3 && (await page.locator("#panes > .split-pane").count()) === 3);
  await page.click("#tab-C4 .tab-close");
  await page.click("#tab-C1 .tab-close");
  await page.waitForFunction(() => !document.getElementById("panes").dataset.split);
  check("split e2e: below two panes the view ends by itself", (await st(page, "s.split.panes.length")) === 0 && (await page.locator("#panes > #pane-main").count()) === 1);
  check("split e2e: no page errors in the grid", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** A real mouse drag from a tab to a point. @param {import("playwright").Page} page @param {{ x: number, y: number, width: number, height: number }} from @param {number} x @param {number} y */
async function dragTo(page, from, x, y) {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

/** Dragging with the mouse: to the right zone, the zones are drawn with text, Esc cancels, a short move is a click, reordering inside the bar. */
async function mouseScenario(browser, base, check) {
  const { ctx, page, errors } = await fresh(browser, base);
  await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA], ["tre.jdx", GAMMA]]);
  await page.waitForSelector("#tab-C3");
  const area = await rect(page, "#panes");
  const tab1 = await rect(page, "#tab-C1");
  await page.mouse.move(tab1.x + tab1.width / 2, tab1.y + tab1.height / 2);
  await page.mouse.down();
  await page.mouse.move(tab1.x + tab1.width / 2 + 3, tab1.y + tab1.height / 2);
  check("split drag: under 6 px nothing starts", (await page.locator("body[data-tab-drag]").count()) === 0);
  await page.mouse.move(area.x + area.width * 0.9, area.y + area.height / 2, { steps: 8 });
  await page.waitForSelector(".drop-zone[data-active][data-side='right']");
  const zones = await page.locator(".drop-zone .drop-label").allTextContents();
  check("split drag: five zones, each with its words and not only a colour", zones.length === 5 && zones.every((z) => z.trim().length > 3), zones.join("|"));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  check("split drag: Esc cancels, nothing changes and the overlay is gone", (await st(page, "s.split.panes.length")) === 0 && (await page.locator(".drop-zones, .tab-ghost").count()) === 0 && (await page.locator("body[data-tab-drag]").count()) === 0);
  check("split drag: after a cancelled drag the tab did not get the focus by the click", (await st(page, "s.focusTab")) === "C3");
  await dragTo(page, tab1, area.x + area.width * 0.9, area.y + area.height / 2);
  check("split drag: dropped on the right zone the tab is beside the focused one, in a row", (await st(page, "s.split.panes.join() === 'C3,C1' && s.split.orientation === 'row' && s.focusTab === 'C3'")) === true);
  check("split drag: the drop is announced", await page.waitForFunction(() => /C1 affiancata a destra/.test(document.getElementById("status").textContent)).then(() => true, () => false));
  const first = await rect(page, "#panebox-C3");
  const second = await rect(page, "#panebox-C1");
  check("split drag: two boxes side by side", second.x > first.x + first.width - 2 && Math.abs(second.y - first.y) < 2);
  const tab2 = await rect(page, "#tab-C2");
  const tab1b = await rect(page, "#tab-C1");
  await page.mouse.move(tab2.x + tab2.width / 2, tab2.y + tab2.height / 2);
  await page.mouse.down();
  await page.mouse.move(tab2.x + tab2.width / 2 - 20, tab2.y + 6, { steps: 3 });
  await page.mouse.move(tab1b.x + 3, tab1b.y + tab1b.height / 2, { steps: 6 });
  check("split drag: over the bar an insertion line shows where the tab goes", (await page.locator(".tab-insert").count()) === 1 && (await page.locator(".drop-zones").count()) === 0);
  await page.mouse.up();
  check("split drag: dropped in the bar the tab is reordered", (await page.locator("#doc-tabs [role=tab]").evaluateAll((l) => l.map((b) => b.dataset.tab).join())) === "C2,C1,C3");
  await page.click("#tab-C2");
  check("split drag: a click on a tab still shows it", (await st(page, "s.focusTab")) === "C2");
  check("split drag: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** Touch: a long press then a move drags; a short move scrolls and does not drag; a long press without moving opens the menu. */
async function touchScenario(browser, base, check) {
  const { ctx, page } = await fresh(browser, base, { hasTouch: true });
  await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA]]);
  await page.waitForSelector("#tab-C2");
  const fire = (type, sel, x, y) => page.evaluate(([ty, se, cx, cy]) => {
    const target = ty === "pointerdown" ? document.querySelector(se) : document.querySelector(se);
    target.dispatchEvent(new PointerEvent(ty, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: ty === "pointerup" ? 0 : 1 }));
  }, [type, sel, x, y]);
  const tab = await rect(page, "#tab-C1");
  const x0 = tab.x + tab.width / 2;
  const y0 = tab.y + tab.height / 2;
  await fire("pointerdown", "#tab-C1", x0, y0);
  await fire("pointermove", "#tab-C1", x0 + 40, y0);
  await page.waitForTimeout(600);
  check("split touch: a short scroll before the long press does not drag", (await page.locator("body[data-tab-drag]").count()) === 0);
  await fire("pointerup", "#tab-C1", x0 + 40, y0);
  check("split touch: and changes nothing", (await st(page, "s.split.panes.length")) === 0);
  const area = await rect(page, "#panes");
  await fire("pointerdown", "#tab-C1", x0, y0);
  await page.waitForTimeout(250);
  check("split touch: before 450 ms nothing has started", (await page.locator("body[data-tab-drag]").count()) === 0);
  await page.waitForTimeout(350);
  check("split touch: after the long press the drag is on", (await page.locator("body[data-tab-drag]").count()) === 1);
  await fire("pointermove", "#tab-C1", area.x + area.width * 0.9, area.y + area.height / 2);
  await fire("pointerup", "#tab-C1", area.x + area.width * 0.9, area.y + area.height / 2);
  check("split touch: dropped on the right zone it is put beside", (await st(page, "s.split.panes.join()")) === "C2,C1");
  await fire("pointerdown", "#tab-C2", x0, y0);
  await page.waitForTimeout(600);
  await fire("pointerup", "#tab-C2", x0, y0);
  check("split touch: a long press that does not move opens the menu of the tab", (await page.locator('[role=menu] [data-item="tab.unsplit"]').count()) === 1);
  await ctx.close();
}

/** 900 px: a column. 320 px: one pane and the note that says which, no sideways scroll. Axe in light, dark and English. */
async function sizesScenario(browser, base, check, axe) {
  for (const [scheme, locale, width] of [["light", "it-IT", 900], ["dark", "it-IT", 1366], ["light", "en-GB", 1366], ["light", "it-IT", 320], ["dark", "en-GB", 320]]) {
    const { ctx, page, requests } = await fresh(browser, base, { colorScheme: scheme, locale, viewport: { width, height: width === 320 ? 640 : 768 } });
    await upload(page, [["uno.jdx", ALFA], ["due.jdx", BETA], ["tre.jdx", GAMMA]]);
    await page.waitForSelector("#tab-C3");
    await page.evaluate(async () => {
      const s = await import(new URL("state.js", location.href).href);
      const p = await import(new URL("panes.js", location.href).href);
      s.update(p.splitPatch(s.getState(), "C2", "right"));
      s.update(p.splitPatch(s.getState(), "C1", "right", "C2"));
    });
    await page.waitForSelector("#panes[data-split='3']");
    await page.waitForSelector(width === 320 ? "#panes .split-pane:not([hidden]) #pane-main" : ".pane-chart svg");
    const label = `${scheme}, ${locale}, ${width}px`;
    const boxes = await page.locator("#panes > .split-pane:not([hidden])").evaluateAll((l) => l.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }));
    if (width === 900) check("split view: at 900 px the panes are one column of two", boxes.length === 2 && boxes[0][0] === boxes[1][0] && boxes[1][1] > boxes[0][1], JSON.stringify(boxes));
    if (width === 320) {
      check("split view: at 320 px one pane is shown and the note says which", boxes.length === 1 && ((await page.textContent("#split-note")) ?? "").length > 10 && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
      check("split view: at 320 px the chart fits its box", await page.evaluate(() => { const b = document.querySelector("#panes .split-pane:not([hidden])"); const c = b.querySelector("svg"); return c.getBoundingClientRect().right <= b.getBoundingClientRect().right + 1; }));
    }
    const v = await axe(page);
    check(`split view: axe has no violations (${label})`, v.length === 0, v.join(", "));
    if (width === 1366) {
      check(`split view: the controls speak the language (${label})`, (await page.textContent('[data-split="link"]')) === (locale === "en-GB" ? "Link the x axis" : "Collega l'asse x"));
      check(`split view: no request leaves the site (${label})`, requests.every((u) => u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")), requests.filter((u) => !u.startsWith(base)).join(" "));
      const stored = await page.evaluate(async () => ({ local: Object.keys(localStorage), session: sessionStorage.length, idb: (await indexedDB.databases()).length }));
      check(`split view: nothing is stored but preferences (${label})`, stored.local.every((k) => k.startsWith("checkir.")) && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
    }
    await ctx.close();
  }
}

export async function splitScenario(browser, base, check, axe) {
  const { ctx, page, errors } = await fresh(browser, base);
  await sideBySideScenario(page, check);
  await closeScenario(page, check);
  check("split e2e: no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await gridScenario(browser, base, check);
  await mouseScenario(browser, base, check);
  await touchScenario(browser, base, check);
  await sizesScenario(browser, base, check, axe);
}
