// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { matchScenario } from "../confronto.mjs";

export default ({ browser, base, check, axe }) => matchScenario(browser, base, check, axe);
