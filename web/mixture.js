// @ts-check
import { alertViews } from "./alerts.js";
import { el, icon } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { libraryRows } from "./librerie.js";
import { candidateKey } from "./state.js";

/**
 * The mixture proposal of a comparison (`data.mixture`, made in the worker by `miscele_job.js`): the components that together explain the
 * spectrum, each with its contribution to the spectrum (a share of the explained area, never a percentage by weight or an amount) and
 * the main peaks it explains. The program proposes; the chemist accepts it at level 4 or leaves it.
 * When the engine rejects the proposal (`data.mixture.rejected`) there is no component, only the reason, shown in place of the mixture.
 * @typedef {{ id: string, library: string, name: string, substance: string | null, is_cut: boolean, contribution: number, explained: number | null, minor?: boolean }} Component
 */

/** @param {any} data a comparison @returns {Component[]} the proposed components, empty when there is no proposal */
export function mixtureComponents(data) {
  return Array.isArray(data?.mixture?.components) ? data.mixture.components : [];
}

/** The components as candidates of the decision (same keys as the list, so a component that is also a candidate is the same one). @param {any} data @returns {any[]} */
export function mixtureCandidates(data) {
  return mixtureComponents(data).map((c) => {
    const row = libraryRows(c.library)?.find((r) => r.id === c.id);
    return { library: c.library, spectrum_id: c.id, display_name: c.name, substance: c.substance ?? undefined, form: row?.form ?? "", mixture: true };
  });
}

/** @param {any} data @returns {string[]} keys of the components */
export function mixtureKeys(data) {
  return mixtureCandidates(data).map(candidateKey);
}

/** Do these keys hold exactly the components of the proposal? @param {any} data @param {string[]} keys @returns {boolean} */
export function mixtureTaken(data, keys) {
  const want = mixtureKeys(data);
  return want.length > 0 && want.length === keys.length && want.every((k) => keys.includes(k));
}

/** @param {Component} c @param {(c: Component) => string} nameOf @returns {HTMLElement} */
function componentRow(c, nameOf) {
  const explained = c.explained === null ? "—" : formatNumber(c.explained);
  return el("li", { class: "mixture-part", "data-component": `${c.library}/${c.id}` }, [
    el("strong", {}, [nameOf(c)]),
    el("span", {}, [` ${t("mixture.contribution")} ${formatNumber(c.contribution, 2)} · ${t("mixture.explained")} ${explained}`]),
    ...(c.minor ? [el("span", { class: "mixture-minor", "data-minor": "1" }, [` · ${t("mixture.minor")}`])] : []),
  ]);
}

/**
 * Why the engine makes no proposal although it found several components (computed on this result, not a generic caution).
 * @param {any} mixture @param {(c: Component) => string} nameOf @returns {HTMLElement | null}
 */
function rejectedBlock(mixture, nameOf) {
  const why = mixture?.rejected;
  if (!why) return null;
  const text =
    why.reason === "component_without_peaks" && why.component
      ? t("mixture.rejected_no_peaks", { name: nameOf(why.component) })
      : t("mixture.rejected_residual", { share: formatNumber(mixture.unexplained_variance_share ?? 0, 2) });
  return el("section", { class: "mixture", "aria-label": t("mixture.label"), "data-mixture-rejected": String(why.reason) }, [el("p", { class: "mixture-line" }, [text])]);
}

/**
 * The lines above the table: «Mixture: A + B», each part with its contribution and peaks explained, the peaks nobody explains, the alerts
 * of the mixture search and the button that takes the mixture at level 4.
 * @param {any} data @param {boolean} taken the draft already holds exactly these components @param {boolean} locked a signed decision cannot change
 * @param {(c: Component) => string} nameOf the name in the active language @param {() => void} accept
 * @returns {HTMLElement | null} null when there is no proposal; the reason when the engine rejected one
 */
export function mixtureBlock(data, taken, locked, nameOf, accept) {
  const parts = mixtureComponents(data);
  if (!parts.length) return rejectedBlock(data?.mixture, nameOf);
  const button = el("button", { type: "button", class: "btn", "data-fk": "mixture-accept", "aria-pressed": String(taken) }, [icon("compare"), t("mixture.accept")]);
  button.disabled = locked || taken;
  button.addEventListener("click", accept);
  const alerts = alertViews(data.mixture);
  return el("section", { class: "mixture", "aria-label": t("mixture.label"), "data-mixture": "1" }, [
    el("p", { class: "mixture-line" }, [el("strong", {}, [t("mixture.title", { names: parts.map(nameOf).join(" + ") })]), " ", button]),
    el("ul", { class: "mixture-parts" }, parts.map((c) => componentRow(c, nameOf))),
    el("p", { class: "mixture-left", "data-unexplained": String(data.mixture.unexplained ?? 0) }, [t("mixture.unexplained", { n: formatNumber(data.mixture.unexplained ?? 0) })]),
    ...alerts.map((a) => el("p", { class: "alert", "data-alert": a.id }, [icon("warning"), el("strong", {}, [`${a.label}: `]), ...a.reasons])),
  ]);
}
