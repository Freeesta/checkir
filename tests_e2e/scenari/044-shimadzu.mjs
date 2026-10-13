// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { shimadzuScenario } from "../shimadzu_lib.mjs";

export default ({ browser, base, check, axe }) => shimadzuScenario(browser, base, check, axe);
