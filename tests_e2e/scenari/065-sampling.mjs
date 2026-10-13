// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { samplingScenario } from "../campionamento.mjs";

export default ({ browser, base, check }) => samplingScenario(browser, base, check);
