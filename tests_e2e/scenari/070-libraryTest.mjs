// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { libraryTestScenario } from "../prova.mjs";

export default ({ browser, base, check, axe }) => libraryTestScenario(browser, base, check, axe);
