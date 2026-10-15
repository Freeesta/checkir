// A public library that is off is not downloaded until it is switched on.
import { lazyScenario } from "../librerie.mjs";

export default ({ browser, base, check }) => lazyScenario(browser, base, check);
