// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { splitPureScenario, splitScenario } from "../tabs_split.mjs";

export default async ({ browser, base, check, axe }) => {
  await splitPureScenario(check);
  await splitScenario(browser, base, check, axe);
};
