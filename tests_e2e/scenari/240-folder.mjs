// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { folderScenario } from "../cartella.mjs";

export default ({ browser, base, check, axe }) => folderScenario(browser, base, check, axe);
