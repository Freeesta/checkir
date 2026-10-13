// @ts-check
import { actionById } from "./actions.js";
import { actionButton } from "./controls.js";
import { el, icon, keepFocus, setIcon } from "./dom.js";
import { formatNumber, t } from "./i18n.js";
import { readPref, writePref } from "./state.js";

/**
 * Registry of the side-panel sections (1 File … 5 Scheda). The panel, the phone tab bar and the header chips are generated from it.
 * `summary` is the numeric line shown when the section is closed; `render` fills the open section.
 * @typedef {{
 *   id: string, n: number, titleKey: string, tipKey: string, icon: string,
 *   summary: (s: import("./state.js").AppState) => string, label?: (s: import("./state.js").AppState) => string,
 *   render: (body: HTMLElement, s: import("./state.js").AppState, ctx: import("./actions.js").Ctx) => void,
 * }} PanelDef
 */

const DASH = "—";
const MOBILE = "(max-width: 45em)";

/** @param {HTMLElement} body @param {string} text */
function emptyLine(body, text) {
  body.append(el("p", { class: "empty" }, [text]));
}

/** @param {import("./state.js").FileEntry} f @returns {string} */
export function fileRange(f) {
  return `${formatNumber(f.fromCm1)}–${formatNumber(f.toCm1)} · ${formatNumber(f.stepCm1)} ${t("unit.cm1")}`;
}

/** @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
function renderFiles(body, s, ctx) {
  body.append(el("div", { class: "row" }, [actionButton("file.open", ctx, { withLabel: true, className: "btn" }), actionButton("demo.load", ctx, { withLabel: true, className: "btn" })]));
  if (!s.files.length) return emptyLine(body, t("panel.files.empty"));
  const list = el("ul", { class: "files" });
  for (const f of s.files) {
    const item = el("li", {}, [icon("file"), el("strong", {}, [f.code]), ` ${f.name ?? t("file.demo_name")} · ${fileRange(f)}`]);
    for (const w of f.warnings) item.append(el("span", { class: "warn" }, [icon("warning"), t(w)]));
    list.append(item);
  }
  body.append(list);
}

/** @param {() => string} text @returns {PanelDef["render"]} */
function renderEmpty(text) {
  return (body) => emptyLine(body, text());
}

/** @type {PanelDef[]} */
export const PANELS = [
  { id: "files", n: 1, titleKey: "panel.files.title", tipKey: "panel.files.tip", icon: "file", summary: (s) => formatNumber(s.files.length), render: renderFiles },
  {
    id: "libraries", n: 2, titleKey: "panel.libraries.title", tipKey: "panel.libraries.tip", icon: "library",
    summary: (s) => `${formatNumber(s.libraries.length)} · ${formatNumber(s.libraries.reduce((a, l) => a + l.spectra, 0))}`,
    render: renderEmpty(() => t("panel.libraries.empty")),
  },
  { id: "results", n: 3, titleKey: "panel.results.title", tipKey: "panel.results.tip", icon: "results", summary: (s) => (s.result ? formatNumber(s.result.level) : DASH), render: renderEmpty(() => t("panel.results.empty")) },
  { id: "peaks", n: 4, titleKey: "panel.peaks.title", tipKey: "panel.peaks.tip", icon: "peaks", summary: (s) => `● ${formatNumber(s.peaks.explained)} ○ ${formatNumber(s.peaks.unexplained)}`, label: (s) => t("panel.peaks.counts", { explained: formatNumber(s.peaks.explained), unexplained: formatNumber(s.peaks.unexplained) }), render: renderEmpty(() => t("panel.peaks.empty")) },
  { id: "sheet", n: 5, titleKey: "panel.sheet.title", tipKey: "panel.sheet.tip", icon: "sheet", summary: (s) => (s.decision ? formatNumber(s.decision.level) : DASH), render: renderEmpty(() => t("panel.sheet.empty")) },
];

/** @param {string} id @returns {HTMLDetailsElement | null} */
function sectionOf(id) {
  return document.querySelector(`details[data-panel="${id}"]`);
}

/**
 * Build the side panel and the phone tab bar into their (empty) hosts.
 * @param {{ panel: HTMLElement, tabbar: HTMLElement }} hosts
 * @param {import("./actions.js").Ctx} ctx
 * @returns {{ refresh: (s: import("./state.js").AppState) => void, openSection: (id: string) => void, toggle: () => void, isRail: () => boolean }}
 */
export function buildPanels(hosts, ctx) {
  const isRail = () => document.body.dataset.panel === "rail";
  const setRail = (/** @type {boolean} */ rail) => {
    document.body.dataset.panel = rail ? "rail" : "open";
    writePref("panel", rail ? "rail" : "open");
    syncToggle();
  };
  const head = el("div", { class: "panel-head" });
  const toggleButton = actionButton("panel.toggle", ctx);
  toggleButton.setAttribute("aria-expanded", "true");
  const backButton = el("button", { type: "button", class: "icon-button panel-back", "data-fk": "back" }, [icon("back")]);
  backButton.addEventListener("click", () => {
    const id = document.body.dataset.section;
    delete document.body.dataset.section;
    syncTabs();
    /** @type {HTMLElement | null} */ (hosts.tabbar.querySelector(`[data-goto="${id}"]`))?.focus();
  });
  head.append(toggleButton, backButton);
  hosts.panel.append(head);
  const syncToggle = () => {
    toggleButton.setAttribute("aria-expanded", String(!isRail()));
    const svg = toggleButton.querySelector("svg");
    if (svg) setIcon(svg, isRail() ? "panel-closed" : "panel-open");
  };
  const syncTabs = () => {
    for (const b of hosts.tabbar.querySelectorAll("[data-goto]")) {
      if (/** @type {HTMLElement} */ (b).dataset.goto === document.body.dataset.section) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
  };
  for (const p of PANELS) {
    const section = el("details", { class: "panel-section", "data-panel": p.id, name: "panel" });
    const summary = el("summary", {}, [icon(p.icon), el("span", { class: "num" }, [formatNumber(p.n)]), el("span", { class: "title" }), el("span", { class: "sum" })]);
    summary.addEventListener("click", (e) => {
      if (!isRail()) return;
      e.preventDefault();
      openSection(p.id);
    });
    section.append(summary, el("div", { class: "panel-body" }));
    hosts.panel.append(section);
    const tab = el("button", { type: "button", class: "tab", "data-goto": p.id }, [icon(p.icon), el("span", { class: "num" }, [formatNumber(p.n)])]);
    tab.addEventListener("click", () => actionById(`panel.goto.${p.n}`).run(ctx));
    hosts.tabbar.append(tab);
  }
  function openSection(/** @type {string} */ id) {
    const section = sectionOf(id);
    if (!section) return;
    if (matchMedia(MOBILE).matches) document.body.dataset.section = id;
    else if (isRail()) setRail(false);
    section.open = true;
    syncTabs();
    section.querySelector("summary")?.focus();
  }
  const refresh = (/** @type {import("./state.js").AppState} */ s) => {
    for (const p of PANELS) {
      const section = /** @type {HTMLElement} */ (sectionOf(p.id));
      const title = t(p.titleKey);
      section.querySelector(".title")?.replaceChildren(title);
      section.querySelector(".sum")?.replaceChildren(p.summary(s));
      const spoken = `${title} ${(p.label ?? p.summary)(s)}`;
      section.querySelector("summary")?.setAttribute("aria-label", `${formatNumber(p.n)} ${spoken}`);
      const body = /** @type {HTMLElement} */ (section.querySelector(".panel-body"));
      keepFocus(body, () => {
        body.replaceChildren();
        p.render(body, s, ctx);
      });
      hosts.tabbar.querySelector(`[data-goto="${p.id}"]`)?.setAttribute("aria-label", spoken);
    }
    backButton.setAttribute("aria-label", t("panel.back"));
    hosts.tabbar.setAttribute("aria-label", t("panel.nav"));
    hosts.panel.setAttribute("aria-label", t("action.panel_toggle.label"));
  };
  setRail(readPref("panel") === "rail");
  sectionOf("files")?.setAttribute("open", "");
  return { refresh, openSection, toggle: () => setRail(!isRail()), isRail };
}
