// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { rangesScenario } from "../regioni.mjs";

export default ({ browser, base, check, axe }) => rangesScenario(browser, base, check, axe);
