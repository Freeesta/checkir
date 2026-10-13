// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { inverseScenario } from "../inversa.mjs";

export default ({ browser, base, check, axe }) => inverseScenario(browser, base, check, axe);
