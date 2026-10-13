// Scenario run by fumo.mjs (files in this folder run in name order; add a file to add a scenario).
import { shimadzuPureScenario } from "../shimadzu_lib.mjs";

export default ({ check }) => shimadzuPureScenario(check);
