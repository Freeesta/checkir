// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { rangesPureScenario } from "../regioni.mjs";

export default ({ browser, base, check, axe }) => rangesPureScenario(check);
