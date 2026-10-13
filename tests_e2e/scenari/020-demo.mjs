// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { demoScenario } from "../demo.mjs";

export default ({ browser, base, check, axe }) => demoScenario(browser, base, check, axe);
