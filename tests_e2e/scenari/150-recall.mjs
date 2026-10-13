// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { recallScenario } from "../richiamo.mjs";

export default ({ browser, base, check, axe }) => recallScenario(browser, base, check, axe);
