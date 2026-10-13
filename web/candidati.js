// @ts-check
// How the candidates of a comparison are shown: the score on a 0-100 scale and the list without repeated spectra. No DOM here.

/** Similarity r (−1…1) as the score on show: r × 100, a whole number, never below 0. Thresholds and levels stay on r. @param {number} r @returns {number} */
export function matchScore(r) {
  return Number.isFinite(r) ? Math.min(100, Math.max(0, Math.round(r * 100))) : 0;
}

/** The margin (r₁ − best r of another substance) on the same scale, or null when there is none. @param {number | null | undefined} m @returns {number | null} */
export function marginScore(m) {
  return typeof m === "number" && Number.isFinite(m) ? Math.max(0, Math.round(m * 100)) : null;
}

/** @param {any} c @returns {string} */
const named = (c) => `${String(c.display_name ?? "").trim().toLowerCase()}\u0001${c.form ?? ""}`;

/** Spectrum identity for the list, in two ways: the same name and form in the same library, or the same r (to 8 decimals) in two libraries, whatever the names (the same file imported next to the public library). @param {any} c @returns {string[]} */
function identities(c) {
  const r = Number(c.r_derivative);
  return Number.isFinite(r) ? [`${c.library}\u0001${named(c)}`, `r\u0001${r.toFixed(8)}`] : [`${c.library}\u0001${named(c)}`];
}

/**
 * The same spectrum never appears twice: candidates that `identities` says are one collapse into the best one
 * (`others` = how many were folded into it). Ranks are renumbered and, when the first candidate had copies, the margin is
 * taken from the next different one. Returns the data unchanged when nothing repeats.
 * @param {any} data a comparison result @returns {any}
 */
export function dedupeCandidates(data) {
  const list = /** @type {any[]} */ (data?.candidates ?? []);
  /** @type {Map<string, any>} */
  const seen = new Map();
  /** @type {any[]} */
  const kept = [];
  for (const c of list) {
    const keys = identities(c);
    const first = keys.map((k) => seen.get(k)).find(Boolean);
    if (first) first.others += 1;
    else kept.push({ ...c, others: 0 });
    for (const k of keys) if (!seen.has(k)) seen.set(k, first ?? kept[kept.length - 1]);
  }
  if (kept.length === list.length) return data;
  kept.forEach((c, i) => (c.rank = i + 1));
  const margin = kept.length > 1 && kept[0].others > 0 ? kept[0].r_derivative - kept[1].r_derivative : data.margin;
  return { ...data, candidates: kept, margin };
}

/** Name proposed for an imported library: the folder, else the first file without its extension. @param {File[]} files @returns {string} */
export function proposedLibraryName(files) {
  const path = files.map((f) => f.webkitRelativePath).find((p) => p.includes("/"));
  const base = path ? path.split("/")[0] : (files[0]?.name ?? "").replace(/\.[^.]*$/, "");
  return base.trim().slice(0, 60);
}
