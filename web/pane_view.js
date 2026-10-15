// @ts-check
import { wire } from "./chart_wire.js";
import { matchScore } from "./candidati.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { spectrumOf } from "./files.js";
import { buildLayers } from "./layers.js";
import { autoMatchOn, matchSignature, runMatch } from "./match.js";
import { paneState } from "./panes.js";
import { candidateName, levelBadge, SHOWN } from "./results.js";
import { shownLevel } from "./alerts.js";
import { activeFile, resultOf } from "./state.js";
import { kindOf } from "./tab_kinds.js";
import { buildTableTitle } from "./table_title.js";

/**
 * The light pane of a file that is not the focused one, in the side-by-side view: header (code, file name, "Work here", "Take away from the view"), the chart with its own `wire()`
 * and its own data table, the level in words and the first candidates, read only. Classes are `pane-…` (never `.cand`: the tests look for `#main-content .cand`).
 * @typedef {import("./state.js").Tab} Tab
 * @typedef {import("./state.js").AppState} AppState
 */

/** @param {Tab} tab @param {AppState} s @returns {{ code: string, name: string }} */
function labelOf(tab, s) {
  return kindOf(tab).label(tab, s);
}

/** The candidates in words and numbers, read only. @param {AppState} ps @param {string} code @returns {HTMLElement} */
function candidatesOf(ps, code) {
  const result = resultOf(ps);
  const box = el("div", { class: "pane-result" });
  if (!result) return box;
  const list = el("ol", { class: "pane-cands", "aria-label": t("tabs.split.candidates", { code }) });
  for (const c of (result.data.candidates ?? []).slice(0, SHOWN)) {
    list.append(el("li", { class: "pane-cand" }, [el("span", { class: "pane-cand-name" }, [candidateName(c)]), el("span", { class: "pane-cand-r" }, [formatNumber(matchScore(c.r_derivative))])]));
  }
  const level = shownLevel(ps);
  if (level !== null) box.append(el("p", { class: "pane-level" }, [levelBadge(level)]));
  box.append(list);
  return box;
}

/**
 * @param {HTMLElement} host where the pane is built (it is emptied)
 * @param {Tab} tab the file tab
 * @param {import("./actions.js").Ctx} ctx
 * @param {ReturnType<typeof import("./view_link.js").createViewLink>} link the x axis link of the side-by-side view
 * @returns {{ refresh: (s: AppState) => void, destroy: () => void }}
 */
export function buildPaneView(host, tab, ctx, link) {
  const chart = el("div", { class: "pane-chart", tabindex: "0", role: "group" });
  const toolbar = el("div", { class: "toolbar pane-toolbar" });
  const range = el("p", { class: "pane-range", "aria-live": "off" });
  const summary = el("p", { class: "peaks-summary pane-summary", hidden: "" });
  const tableHost = el("div", { class: "scroll pane-table", tabindex: "0", role: "region" });
  const details = el("details", { class: "table-section pane-data" }, [el("summary"), tableHost]);
  const title = el("button", { type: "button", class: "pane-title" });
  const work = el("button", { type: "button", class: "btn pane-work" }, [t("tabs.split.work_here")]);
  const away = el("button", { type: "button", class: "btn pane-away" }, [t("tabs.split.remove")]);
  const head = el("div", { class: "pane-head" }, [title, work, away]);
  const result = el("div", { class: "pane-result-host" });
  host.replaceChildren(head, el("div", { class: "pane-body" }, [summary, toolbar, chart, range, details, result]));
  const here = () => {
    ctx.focusTab(tab.id);
    document.getElementById("chart")?.focus();
  };
  title.addEventListener("click", here);
  work.addEventListener("click", here);
  away.addEventListener("click", () => ctx.unsplitTab(tab.id));
  const tableTitle = buildTableTitle(details, tableHost);
  const code = () => tab.code ?? "";
  const w = wire({ chart, toolbar, tab: tableHost, range }, { announce: () => {}, ctx, localMenu: true, codeOf: code, link });
  const layers = buildLayers(w, summary);
  let shown = /** @type {string | null | undefined} */ (undefined);
  let sig = "";
  let asked = "";
  /** @param {AppState} s the whole state; the pane reads the view of its tab */
  const refresh = (s) => {
    const mine = s.tabs.find((x) => x.id === tab.id);
    if (!mine) return;
    const ps = paneState(s, mine);
    const file = activeFile(ps);
    const now = file?.code ?? null;
    const { name } = labelOf(mine, s);
    const want = [now, currentLang(), name, resultOf(ps)?.sig, ps.selected, ps.overlay, ps.showPeaks, ps.peakFocus, ps.ruleRange?.ruleId, ps.rangeChoice.preset, ps.recall.refs.length, ps.recall.mode, ps.choice[now ?? ""]?.level, s.libraries.length].join("|");
    if (now !== shown) {
      shown = now;
      w.set(now ? (spectrumOf(now) ?? null) : null);
    }
    if (want !== sig) {
      sig = want;
      layers.reset();
      title.replaceChildren(icon(kindOf(mine).icon), el("span", { class: "tab-code" }, [now ?? mine.code ?? ""]), el("span", { class: "pane-name" }, [name]));
      title.setAttribute("aria-label", t("tabs.kind.file", { code: now ?? mine.code ?? "", name }).trim());
      title.title = name;
      chart.setAttribute("aria-label", t("chart.title"));
      tableHost.setAttribute("aria-label", t("table.region"));
      work.textContent = t("tabs.split.work_here");
      away.textContent = t("tabs.split.remove");
      layers.sync(ps, now);
      tableTitle.refresh();
      w.redraw();
      result.replaceChildren(candidatesOf(ps, now ?? ""));
    }
    const signature = now ? matchSignature(ps, now) : "";
    if (now && file?.role === "sample" && autoMatchOn() && signature && !resultOf(ps) && s.matching !== now && asked !== `${now}#${signature}`) {
      asked = `${now}#${signature}`;
      runMatch(now);
    }
  };
  refresh(ctx.getState());
  return {
    refresh,
    destroy() {
      w.destroy();
      host.replaceChildren();
    },
  };
}
