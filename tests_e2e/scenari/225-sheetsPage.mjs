// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { hookScenario, inlineScenario, sheetsPageScenario } from "../schede_pagina.mjs";

export default async ({ browser, base, check, axe }) => {
  await sheetsPageScenario(browser, base, check, axe);
  await inlineScenario(browser, base, check, axe);
  await hookScenario(browser, base, check);
};
