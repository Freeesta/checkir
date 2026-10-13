// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { librariesScenario } from "../librerie.mjs";

export default ({ browser, base, check, axe }) => librariesScenario(browser, base, check, axe);
