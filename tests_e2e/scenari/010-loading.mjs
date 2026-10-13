// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { loadingScenario } from "../caricamento.mjs";

export default ({ browser, base, check, axe }) => loadingScenario(browser, base, check, axe);
