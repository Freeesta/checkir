// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { tabsPureScenario, tabsScenario } from "../tabs.mjs";

export default async ({ browser, base, check, axe }) => {
  await tabsPureScenario(check);
  await tabsScenario(browser, base, check, axe);
};
