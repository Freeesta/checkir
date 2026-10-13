// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { matchPureScenario } from "../confronto.mjs";

export default ({ browser, base, check, axe }) => matchPureScenario(check);
