// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { peaksScenario } from "../picchi.mjs";

export default ({ browser, base, check, axe }) => peaksScenario(browser, base, check, axe);
