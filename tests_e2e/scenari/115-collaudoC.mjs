// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { collaudoCScenario } from "../collaudo_c.mjs";

export default ({ browser, base, check, axe }) => collaudoCScenario(browser, base, check);
