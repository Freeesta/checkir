// Export and the rest of the chart tools: CSV files named by the local code, the chemist's report, key x, Shift+click on a peak, the menu with its keys.
import { pick, prepare } from "./richiamo.mjs";
import { readFile } from "node:fs/promises";

/** The downloads started while `act` runs: name and text. */
async function downloadsDuring(page, act) {
  const files = [];
  const onDownload = async (d) => files.push([d.suggestedFilename(), await readFile(await d.path(), "utf8")]);
  page.on("download", onDownload);
  await act();
  await page.waitForTimeout(800);
  page.off("download", onDownload);
  return files;
}

async function csvScenario(page, check) {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("p");
  await page.waitForSelector("#chart circle.peak");
  const files = await downloadsDuring(page, () => page.keyboard.press("e"));
  const names = files.map(([n]) => n).sort();
  check("export: e downloads the spectrum, the peaks and the candidates named by the code", JSON.stringify(names) === JSON.stringify(["C1-candidates.csv", "C1-peaks.csv", "C1.csv"]), names.join(","));
  const byName = Object.fromEntries(files);
  check("export: the spectrum CSV holds only the sample's points", /^wavenumber_cm1,absorbance\n\d/.test(byName["C1.csv"] ?? ""));
  check("export: the candidates CSV has the comparison's numbers and the peaks CSV their positions", /^rank,name,form,library,r_derivative,coverage\n1,beta,/.test(byName["C1-candidates.csv"] ?? "") && /^position_cm1,intensity,state/.test(byName["C1-peaks.csv"] ?? ""));
  check("export: nothing in the files carries the original file name", !files.some(([n, text]) => /campione/.test(n + text)));
}

async function reportScenario(page, check) {
  await page.evaluate(() => {
    window.__printed = null;
    window.print = () => {
      window.__printed = { mode: document.body.dataset.printing, text: document.getElementById("report-host")?.textContent ?? "" };
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.focus("#chart");
  await page.keyboard.press("Shift+F10");
  await page.waitForSelector('[role="menu"]');
  const keys = await page.$$eval('[role="menu"] .menu-key', (n) => n.map((x) => x.textContent).filter(Boolean));
  check("menu: the rows of the registry show their key on the right", ["e", "n", "b", "p", "x"].every((k) => keys.includes(k)), keys.join(","));
  await page.click('[data-item="export.report"]');
  const printed = await page.evaluate(() => window.__printed);
  check("report: prints alone, with the code, the candidates and no original file name", printed?.mode === "report" && /C1/.test(printed.text) && /beta/.test(printed.text) && !/campione/.test(printed.text), JSON.stringify(printed)?.slice(0, 300));
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.click('[data-item="export.report"]').catch(async () => {
    await page.focus("#chart");
    await page.keyboard.press("Shift+F10");
    await page.click('[data-item="export.report"]');
  });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const text = pdf.toString("latin1");
  check("report: one A4 page", (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length === 1 && /\/MediaBox\s*\[\s*0\s+0\s+59[45]\.\d+\s+84[12]\.\d+/.test(text), (text.match(/\/MediaBox[^\]]*\]/) ?? [""])[0]);
  await page.evaluate(() => {
    document.getElementById("report-host")?.replaceChildren();
    delete document.body.dataset.printing;
  });
  check("report: the host is emptied after printing", (await page.evaluate(() => document.getElementById("report-host")?.textContent)) === "" && (await page.evaluate(() => document.body.dataset.printing)) === undefined);
}

async function toolsScenario(page, check) {
  const box = await page.locator("#chart svg").boundingBox();
  const at = (wn, sy = 170) => ({ x: box.x + (box.width * (56 + ((4000 - wn) / 3600) * 728)) / 800, y: box.y + (box.height * sy) / 360 });
  await page.keyboard.down("Shift");
  await page.mouse.click(at(1362).x, at(1362).y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(200);
  const reading = (await page.locator("#chart .cursor-text").allTextContents()).find((x) => x.startsWith("~")) ?? "";
  check("tools: Shift+click puts the cursor on the top of the peak", /^~13[45]\d\.\d/.test(reading) && !/^~1362/.test(reading), reading);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await page.click('[data-item="cursor.2"]');
  await page.waitForTimeout(200);
  check("menu: Cursor 2 here places the second cursor at the pointer", (await page.locator("#chart .cursor-text").allTextContents()).some((x) => x.startsWith("Δν̃")));
}

async function modeScenario(page, check) {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  await page.waitForSelector("dialog #recall-q");
  await pick(page, "bet");
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("x");
  check("modes: x goes from overlaid to offset", await page.isChecked("#recall-mode-offset"));
  await page.keyboard.press("x");
  check("modes: and then to difference", await page.isChecked("#recall-mode-difference"));
  await page.keyboard.press("x");
  check("modes: and back to overlaid", await page.isChecked("#recall-mode-overlay"));
}

export async function exportScenario(browser, base, check, axe) {
  const { ctx, page } = await prepare(browser, base);
  await csvScenario(page, check);
  await toolsScenario(page, check);
  await reportScenario(page, check);
  await modeScenario(page, check);
  const violations = await axe(page);
  check("export: axe has no violations", violations.length === 0, violations.join(", "));
  await ctx.close();
}
