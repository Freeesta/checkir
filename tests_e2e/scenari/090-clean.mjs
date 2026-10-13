// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { cleanScenario } from "../pulizia.mjs";

export default ({ browser, base, check, axe }) => cleanScenario(browser, base, check, axe);
