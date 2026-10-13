// @ts-check
import { t } from "./i18n.js";

/**
 * The didactic IR regions (`regions/1`, copied to `bands/regions.json` by the site build): range and family, never a verdict.
 * Texts come from the catalogs; a missing file just means no bands on the chart.
 * @typedef {{ id: string, from: number, to: number, family: string }} Band
 */

/** @type {Band[]} */
let bands = [];

/** Load the regions once; a failure leaves the chart without bands. @returns {Promise<Band[]>} */
export async function loadBands() {
  try {
    const res = await fetch(new URL("bands/regions.json", import.meta.url));
    if (!res.ok) return bands;
    const doc = await res.json();
    bands = (doc.regions ?? []).map((/** @type {any} */ g) => ({ id: String(g.id), from: Number(g.range_cm1.min), to: Number(g.range_cm1.max), family: String(g.family) }));
  } catch {
    bands = [];
  }
  return bands;
}

/** @returns {Band[]} */
export function getBands() {
  return bands;
}

/** Keys are written out so the catalog check sees them. @type {Record<string, { name: () => string, tag: () => string }>} */
const TEXTS = {
  xh_stretch: { name: () => t("regions.xh_stretch.name"), tag: () => t("regions.xh_stretch.tag") },
  ch_stretch: { name: () => t("regions.ch_stretch.name"), tag: () => t("regions.ch_stretch.tag") },
  salt_nh: { name: () => t("regions.salt_nh.name"), tag: () => t("regions.salt_nh.tag") },
  instrument: { name: () => t("regions.instrument.name"), tag: () => t("regions.instrument.tag") },
  carbonyl: { name: () => t("regions.carbonyl.name"), tag: () => t("regions.carbonyl.tag") },
  double_bonds: { name: () => t("regions.double_bonds.name"), tag: () => t("regions.double_bonds.tag") },
  ch_bend: { name: () => t("regions.ch_bend.name"), tag: () => t("regions.ch_bend.tag") },
  single_bonds: { name: () => t("regions.single_bonds.name"), tag: () => t("regions.single_bonds.tag") },
  oop: { name: () => t("regions.oop.name"), tag: () => t("regions.oop.tag") },
  far: { name: () => t("regions.far.name"), tag: () => t("regions.far.tag") },
};

/** @param {string} id @returns {string} full name of a region (its id when unknown) */
export function bandName(id) {
  return TEXTS[id]?.name() ?? id;
}

/** @param {string} id @returns {string} short label that fits on the chart */
export function bandTag(id) {
  return TEXTS[id]?.tag() ?? id;
}
