// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { toolsScenario } from "../strumenti.mjs";

export default ({ browser, base, check, axe }) => toolsScenario(browser, base, check, axe);
