// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { sheetsScenario } from "../schede.mjs";

export default ({ browser, base, check, axe }) => sheetsScenario(browser, base, check, axe);
