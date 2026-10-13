// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { sheetScenario } from "../scheda.mjs";

export default ({ browser, base, check, axe }) => sheetScenario(browser, base, check, axe);
