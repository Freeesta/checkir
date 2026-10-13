// Scenario run by fumo.mjs: the export buttons are visible in the files and sheet panels (no context menu needed).
import { openPanel, prepare } from "../richiamo.mjs";
import { readFile } from "node:fs/promises";

async function downloadsDuring(page, act) {
  const files = [];
  const onDownload = async (d) => files.push([d.suggestedFilename(), await readFile(await d.path(), "utf8").catch(() => "")]);
  page.on("download", onDownload);
  await act();
  await page.waitForTimeout(1200);
  page.off("download", onDownload);
  return files;
}

export default async ({ browser, base, check, axe }) => {
  const { ctx, page } = await prepare(browser, base);
  await openPanel(page, "files");
  const names = async (sel) => (await downloadsDuring(page, () => page.click(sel))).map(([n]) => n);
  check("exportButtons: CSV button downloads C1.csv", (await names('[data-action="export.csv"]')).includes("C1.csv"));
  check("exportButtons: SVG button downloads C1.svg", (await names('[data-action="export.svg"]')).includes("C1.svg"));
  check("exportButtons: PNG button downloads C1.png", (await names('[data-action="export.png"]')).includes("C1.png"));
  await page.evaluate(() => {
    window.__printed = null;
    window.print = () => {
      window.__printed = document.body.dataset.printing;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await openPanel(page, "sheet");
  check("exportButtons: the sheet panel has the report button", (await page.locator('[data-action="export.report"]').count()) > 0);
  await page.locator('[data-action="export.report"]').first().click();
  check("exportButtons: the report button prints the report", (await page.evaluate(() => window.__printed)) === "report");
  const violations = await axe(page);
  check("exportButtons: axe has no violations", violations.length === 0, violations.join(", "));
  await page.setViewportSize({ width: 320, height: 640 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("exportButtons: no horizontal overflow at 320 px", !over);
  await ctx.close();
};
