// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { teoriaScenario } from "../teoria.mjs";

export default ({ browser, base, check, axe }) => teoriaScenario(browser, base, check, axe);
