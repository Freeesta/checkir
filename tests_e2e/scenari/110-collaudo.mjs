// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { collaudoScenario } from "../collaudo.mjs";

export default ({ browser, base, check, axe }) => collaudoScenario(browser, base, check);
