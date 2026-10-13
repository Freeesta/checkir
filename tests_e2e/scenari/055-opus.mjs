// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { opusScenario } from "../opus.mjs";

export default ({ browser, base, check, axe }) => opusScenario(browser, base, check, axe);
