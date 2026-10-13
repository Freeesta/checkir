// @ts-check
import { currentLang, t } from "./i18n.js";
import { EXCLUDED_CM1, referenceFor } from "./match.js";
import { candidateName, selectedCandidate } from "./results.js";
import { analyse } from "./peaks.js";
import { summaryText } from "./peaks_view.js";
import { candidateKey, resultOf } from "./state.js";
import { spectrumOf } from "./files.js";

/**
 * The extra layers of the chart: the zone left out of the comparison (whenever the shown spectrum has a result) and the library
 * spectrum of the chosen candidate when the overlay is on. They are redrawn only when what they depend on changes.
 * @param {{ setLayers: (l: import("./chart.js").Layers) => void }} chart
 * @param {HTMLElement} summary the line above the chart that tells in words what the peak markers say
 * @returns {{ sync: (s: import("./state.js").AppState, shown: string | null) => void, reset: () => void }}
 */
export function buildLayers(chart, summary) {
  let last = "";
  /** @type {import("./peaks.js").Analysis | null} */
  let lastAnalysis = null;
  return {
    reset: () => {
      last = "";
      lastAnalysis = null;
    },
    sync(s, shown) {
      const r = resultOf(s);
      const chosen = r ? selectedCandidate(s, r.data) : null;
      const analysis = s.showPeaks ? analyse(s) : null;
      const key = [shown, r?.sig, chosen && candidateKey(chosen), s.overlay, currentLang(), s.showPeaks, s.peakFocus].join("|");
      if (key === last && analysis === lastAnalysis) return;
      last = key;
      lastAnalysis = analysis;
      const name = chosen ? candidateName(chosen) : null;
      summary.hidden = !analysis || !!analysis.error;
      summary.textContent = analysis && !analysis.error ? summaryText(analysis, name) : "";
      const sample = shown ? spectrumOf(shown) : undefined;
      const ref = r && chosen && s.overlay && sample ? referenceFor(chosen.library, chosen.spectrum_id, sample, EXCLUDED_CM1) : null;
      chart.setLayers({
        excluded: r ? { from: EXCLUDED_CM1[0], to: EXCLUDED_CM1[1], label: t("chart.excluded") } : null,
        marks: analysis && { bands: analysis.bands, peaks: analysis.peaks.map((p) => ({ id: p.id, x: p.position, state: p.state, focus: p.id === s.peakFocus, shoulder: p.shoulder })), rows: analysis.peaks, name, focus: s.peakFocus },
        reference: ref && chosen ? { spectrum: ref.spectrum, scale: ref.scale, label: t("chart.reference_legend", { rank: chosen.rank, library: chosen.library }) } : null,
      });
    },
  };
}
