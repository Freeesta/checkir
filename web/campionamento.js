// @ts-check
/**
 * How a sample was measured (`atr_diamond`, `transmission_kbr`…): the names the page shows and the one-gesture choice in the file row.
 * The ids are the ones of `crates/ftir-core/src/campionamento.rs`; `unknown` means "not said", never a method.
 */
import { el } from "./dom.js";
import { setSampling } from "./files.js";
import { t } from "./i18n.js";
import { attachTip } from "./tooltip.js";

/** @type {Record<string, () => string>} */
const NAMES = {
  unknown: () => t("sampling.name.unknown"),
  atr_diamond: () => t("sampling.name.atr_diamond"),
  atr_ge: () => t("sampling.name.atr_ge"),
  atr_znse: () => t("sampling.name.atr_znse"),
  transmission_kbr: () => t("sampling.name.transmission_kbr"),
};

/** Ids in the order the choice lists them. */
export const SAMPLING_IDS = Object.keys(NAMES);

/** @param {string | null | undefined} id @returns {string} the name of a method (the id itself when the page does not know it, "not said" without one) */
export function samplingName(id) {
  return (NAMES[id ?? "unknown"] ?? (() => String(id)))();
}

/**
 * The chip-shaped choice of the sampling of a sample: one gesture, no window. The comparison of the sample is run again by the state change.
 * @param {import("./state.js").FileEntry} f
 * @returns {HTMLSelectElement}
 */
export function samplingChoice(f) {
  const label = t("sampling.label", { code: f.code });
  const select = el("select", { class: "chip sampling-choice", "data-fk": `sampling-${f.code}`, "aria-label": label }, SAMPLING_IDS.map((id) => el("option", { value: id }, [`${t("sampling.prefix")} ${samplingName(id)}`])));
  select.value = SAMPLING_IDS.includes(f.sampling) ? f.sampling : "unknown";
  select.addEventListener("change", () => setSampling(f.code, select.value));
  attachTip(select, () => t("sampling.tip"));
  return select;
}
