// @ts-check
import { currentLang, formatNumber, t } from "./i18n.js";
import { EXCLUDED_CM1, referenceFor } from "./match.js";
import { selectedCandidate } from "./results.js";
import { analyse } from "./peaks.js";
import { recallView } from "./recall.js";
import { candidateKey, resultOf } from "./state.js";
import { spectrumOf } from "./files.js";

/**
 * The extra layers of the chart: the zone left out of the comparison (whenever the shown spectrum has a result) and the library
 * spectrum of the chosen candidate when the overlay is on. They are redrawn only when what they depend on changes.
 * @param {{ setLayers: (l: import("./chart.js").Layers) => void }} chart
 * @returns {{ sync: (s: import("./state.js").AppState, shown: string | null) => void, reset: () => void }}
 */
export function buildLayers(chart) {
  let last = "";
  /** @type {import("./peaks.js").Analysis | null} */
  let lastAnalysis = null;
  let lastRecall = /** @type {import("./recall.js").RecallView | null} */ (null);
  let lastOffset = -1;
  return {
    reset: () => {
      last = "";
      lastAnalysis = null;
      lastRecall = null;
    },
    sync(s, shown) {
      const r = resultOf(s);
      const chosen = r ? selectedCandidate(s, r.data) : null;
      const analysis = s.showPeaks ? analyse(s) : null;
      const key = [shown, r?.sig, chosen && candidateKey(chosen), s.overlay, currentLang(), s.showPeaks, s.peakFocus].join("|");
      const recall = recallView(s);
      const offset = s.recall.mode === "offset" ? s.recall.offset : 0;
      if (key === last && analysis === lastAnalysis && recall === lastRecall && offset === lastOffset) return;
      last = key;
      lastAnalysis = analysis;
      lastRecall = recall;
      lastOffset = offset;
      const sample = shown ? spectrumOf(shown) : undefined;
      const ref = r && chosen && s.overlay && sample ? referenceFor(chosen.library, chosen.spectrum_id, sample, EXCLUDED_CM1) : null;
      chart.setLayers({
        excluded: r ? { from: EXCLUDED_CM1[0], to: EXCLUDED_CM1[1], label: t("chart.excluded") } : null,
        marks: analysis && { regions: analysis.regions, peaks: analysis.peaks.map((p) => ({ id: p.id, x: p.position, state: p.state, focus: p.id === s.peakFocus })), rows: analysis.peaks },
        recalled: s.recall.mode === "difference" ? [] : recall.rows.map((r, i) => ({ spectrum: recall.curves[i].spectrum, label: `${r.name} · ${r.ref.form}`, style: i })),
        difference: recall.difference && { spectrum: recall.difference.spectrum, label: t("recall.difference_label", { name: recall.difference.name, k: formatNumber(recall.difference.k, 2) }) },
        offset,
        reference: ref && chosen ? { spectrum: ref.spectrum, scale: ref.scale, label: t("chart.reference_legend", { rank: chosen.rank, library: chosen.library }) } : null,
      });
    },
  };
}
