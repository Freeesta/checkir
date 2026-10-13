// @ts-check
import { el, SVG_NS } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { matchWorker } from "./match.js";
import { activeLibraries, getState } from "./state.js";

/**
 * The library test, in the information dialog: every spectrum of the active libraries searched in all the others with its
 * own substance taken out, so the best match is a wrong one by construction. The worker does the calculation in blocks
 * (it can be stopped and carries on); this module shows progress, the report and the CSV for the review (ids and names only).
 * The figures describe the libraries and the thresholds, never the probability of one result.
 * @typedef {{ id: string, display_name: string, form: string, library: string }} RowInfo
 * @typedef {{ a: RowInfo, b: RowInfo, r: number }} Pairing
 */

/** @type {{ status: "idle" | "running" | "paused" | "done", done: number, total: number, ids: string, report: any, error: { key: string, params: Record<string, string | number> } | null }} */
const test = { status: "idle", done: 0, total: 0, ids: "", report: null, error: null };
/** @type {Worker | null} */
let wired = null;
/** @type {((text: string) => void) | null} */
let csvWaiting = null;

/** @returns {string[]} ids of the libraries a test would cover */
function activeIds() {
  return activeLibraries(getState()).map((l) => l.id);
}

/** @param {any} m */
function onMessage(m) {
  if (m.type === "prova") Object.assign(test, { done: m.done, total: m.total });
  else if (m.type === "prova-report") Object.assign(test, { report: JSON.parse(m.json), status: test.total > 0 && test.done >= test.total ? "done" : "paused" });
  else if (m.type === "prova-error") Object.assign(test, { status: "idle", error: { key: m.key, params: m.params } });
  else if (m.type === "prova-csv") {
    csvWaiting?.(m.text);
    csvWaiting = null;
    return;
  } else return;
  render();
}

function connect() {
  const w = matchWorker();
  if (wired !== w) {
    w.addEventListener("message", (e) => onMessage(e.data));
    wired = w;
  }
  return w;
}

function start() {
  const ids = activeIds();
  if (!ids.length) return;
  const key = ids.join("|");
  if (key !== test.ids) Object.assign(test, { ids: key, report: null, done: 0, total: 0 });
  Object.assign(test, { status: "running", error: null });
  connect().postMessage({ type: "prova-start", ids });
  render();
}

function stop() {
  wired?.postMessage({ type: "prova-stop" });
}

/** Ask the worker for the CSV and hand it to the person as a file (made in the browser, nothing is sent anywhere). */
function saveCsv() {
  csvWaiting = (text) => {
    if (text.startsWith("{")) return;
    const link = el("a", { download: "library-test.csv", href: URL.createObjectURL(new Blob([text], { type: "text/csv" })) });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };
  connect().postMessage({ type: "prova-csv" });
}

/** @param {Array<Array<string | number>>} rows @param {string[]} heads translated headers @param {string} caption */
function simpleTable(rows, heads, caption) {
  return el("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": caption }, [
    el("table", {}, [
      el("caption", {}, [caption]),
      el("thead", {}, [el("tr", {}, heads.map((h) => el("th", { scope: "col" }, [h])))]),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", {}, [String(c)]))))),
    ]),
  ]);
}

/** @param {RowInfo} x @returns {string} */
function label(x) {
  return `${x.display_name} (${x.form || "–"}) · ${x.library} · ${x.id}`;
}

/** Histogram of the best wrong r with the two thresholds drawn; its data table follows. @param {any} rep @returns {HTMLElement} */
function histogram(rep) {
  const h = rep.histogram;
  /** @type {number[]} */
  const counts = h.counts;
  const [w, hh, pad] = [320, 140, 24];
  const max = Math.max(1, ...counts);
  const bw = (w - 2 * pad) / counts.length;
  const ns = SVG_NS;
  /** @param {string} tag @param {Record<string, string | number>} attrs @returns {SVGElement} */
  const node = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const svg = node("svg", { viewBox: `0 0 ${w} ${hh}`, role: "img", "aria-label": t("prova.hist_alt", { n: formatNumber(rep.done) }), class: "prova-hist" });
  counts.forEach((c, i) => {
    const bh = (c / max) * (hh - 2 * pad);
    svg.append(node("rect", { class: "prova-bar", x: pad + i * bw + 1, y: hh - pad - bh, width: Math.max(0, bw - 2), height: bh }));
  });
  svg.append(node("line", { class: "axis", x1: pad, x2: w - pad, y1: hh - pad, y2: hh - pad }));
  for (const [r, cls] of [[rep.check_r1, "prova-line-check"], [rep.probable_r1, "prova-line-probable"]]) {
    const x = pad + r * (w - 2 * pad);
    svg.append(node("line", { class: cls, x1: x, x2: x, y1: pad / 2, y2: hh - pad }));
  }
  for (const r of [0, 0.5, 1]) {
    const text = node("text", { class: "label", x: pad + r * (w - 2 * pad), y: hh - 8, "text-anchor": "middle" });
    text.textContent = formatNumber(r, 1);
    svg.append(text);
  }
  const rows = counts.map((c, i) => [`${formatNumber(i * h.width, 2)}–${formatNumber((i + 1) * h.width, 2)}`, c]);
  const legend = t("prova.hist_lines", { check: formatNumber(rep.check_r1, 2), probable: formatNumber(rep.probable_r1, 2) });
  return el("div", {}, [
    el("h4", {}, [t("prova.hist_title")]),
    svg,
    el("p", { class: "empty" }, [legend, " ", t("prova.below", { n: formatNumber(h.below) })]),
    el("details", {}, [el("summary", {}, [t("prova.hist_table")]), simpleTable(rows, [t("prova.col_bin"), t("prova.col_count")], t("prova.hist_title"))]),
  ]);
}

/** @param {Pairing[]} list @param {number} total @param {string} title @returns {HTMLElement} */
function pairingTable(list, total, title) {
  const note = total > list.length ? [el("p", { class: "empty" }, [t("prova.list_cut", { n: formatNumber(list.length) })])] : [];
  return el("div", {}, [simpleTable(list.map((p) => [formatNumber(p.r, 3), label(p.a), label(p.b)]), [t("prova.col_r"), t("prova.col_a"), t("prova.col_b")], title), ...note]);
}

/** @param {any} rep @returns {HTMLElement} */
function reportView(rep) {
  /** @type {Pairing[]} */
  const twins = rep.twins_list;
  const strong = twins.filter((p) => p.r >= rep.twin_strong_r);
  const weak = twins.filter((p) => p.r < rep.twin_strong_r);
  const cov = rep.coverage.map((/** @type {any} */ c) => [c.library, c.substances, c.base_only, c.salt_only, c.both, c.no_form].map((x) => (typeof x === "number" ? formatNumber(x) : x)));
  const sections = [
    el("p", { role: "status" }, [t("prova.summary", { done: formatNumber(rep.done), total: formatNumber(rep.total) })]),
    el("p", {}, [t("prova.thresholds", { r1: formatNumber(rep.probable_r1, 2), margin: formatNumber(rep.probable_margin, 2) })]),
    el("p", { class: "prova-count" }, [el("strong", {}, [t("prova.wrong_probable", { n: formatNumber(rep.probable_wrong) })])]),
    el("p", {}, [t("prova.wrong_check", { n: formatNumber(rep.to_check_wrong) })]),
    histogram(rep),
    el("h4", {}, [t("prova.twins_title")]),
    el("p", {}, [t("prova.twins_count", { strong: formatNumber(rep.twins_strong), weak: formatNumber(rep.twins_weak), r1: formatNumber(rep.twin_r, 2), r2: formatNumber(rep.twin_strong_r, 2) })]),
  ];
  if (strong.length) sections.push(pairingTable(strong, rep.twins_strong, t("prova.twins_strong_title", { r: formatNumber(rep.twin_strong_r, 2) })));
  if (weak.length) sections.push(pairingTable(weak, rep.twins_weak, t("prova.twins_weak_title", { r: formatNumber(rep.twin_r, 2) })));
  sections.push(
    el("h4", {}, [t("prova.coverage_title")]),
    simpleTable(cov, [t("prova.col_library"), t("prova.col_substances"), t("prova.col_base_only"), t("prova.col_salt_only"), t("prova.col_both"), t("prova.col_no_form")], t("prova.coverage_title")),
  );
  if (rep.grouping !== "identity") sections.push(el("p", { class: "empty" }, [t("prova.grouping_name")]));
  const csv = el("button", { type: "button" }, [t("prova.csv")]);
  csv.addEventListener("click", saveCsv);
  sections.push(el("p", {}, [csv]));
  return el("div", { class: "prova-report" }, sections);
}

/** @returns {HTMLElement[]} the controls for the state now */
function controls() {
  const ids = activeIds();
  const same = ids.join("|") === test.ids;
  const running = test.status === "running";
  const go = el("button", { type: "button", id: "prova-start" }, [test.status === "paused" && same ? t("prova.resume") : t("prova.start")]);
  if (running || !ids.length) go.setAttribute("disabled", "");
  go.addEventListener("click", start);
  const cancel = el("button", { type: "button", id: "prova-stop" }, [t("prova.cancel")]);
  if (!running) cancel.setAttribute("disabled", "");
  cancel.addEventListener("click", stop);
  /** @type {HTMLElement[]} */
  const out = [el("div", { class: "prova-actions" }, [go, cancel])];
  if (!ids.length) out.push(el("p", { class: "empty" }, [t("prova.no_libraries")]));
  if (running) {
    const bar = el("progress", { max: String(Math.max(1, test.total)), value: String(test.done), "aria-label": t("prova.title") });
    out.push(bar, el("p", { class: "empty" }, [t("prova.progress", { done: formatNumber(test.done), total: formatNumber(test.total) })]));
  }
  if (test.error) out.push(el("p", { role: "alert" }, [t(test.error.key, test.error.params)]));
  return out;
}

function render() {
  const slot = document.getElementById("prova-slot");
  if (!slot) return;
  const view = test.report ? [el("h4", {}, [test.status === "done" ? t("prova.finished") : t("prova.partial")]), reportView(test.report)] : [];
  slot.replaceChildren(...controls(), ...view);
}

/** The section of the information dialog (rebuilt at every opening; what the test found is kept while the page is open). @returns {HTMLElement} */
export function provaSection() {
  const section = el("section", {}, [el("h3", {}, [t("prova.title")]), el("p", { class: "empty" }, [t("prova.hint")]), el("div", { id: "prova-slot" })]);
  queueMicrotask(render);
  return section;
}
