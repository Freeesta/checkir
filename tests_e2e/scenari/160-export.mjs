// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { exportScenario } from "../esporta.mjs";

export default ({ browser, base, check, axe }) => exportScenario(browser, base, check, axe);
