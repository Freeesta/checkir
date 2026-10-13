// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { areaScenario } from "../area.mjs";

export default ({ browser, base, check, axe }) => areaScenario(browser, base, check, axe);
