// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { tabsSheetsScenario } from "../tabs_sheets.mjs";

export default async ({ browser, base, check, axe }) => {
  await tabsSheetsScenario(browser, base, check, axe);
};
