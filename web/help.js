// @ts-check
import { ACTIONS } from "./actions.js";
import { el, icon } from "./dom.js";
import { t } from "./i18n.js";
import { setShortcutsOn, shortcutsOn } from "./shortcuts.js";

/** @param {string} text @returns {HTMLElement} */
const kbd = (text) => el("kbd", {}, [text]);

/** @param {string[]} heads @param {Node[][]} rows @param {string} captionKey @returns {HTMLElement} */
function table(heads, rows, captionKey) {
  return el("table", { class: "help-table" }, [
    el("caption", { class: "sr-only" }, [t(captionKey)]),
    el("thead", {}, [el("tr", {}, heads.map((h) => el("th", { scope: "col" }, [h])))]),
    el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) => el("td", {}, [c]))))),
  ]);
}

/** The tag that marks an action not built yet: text, never colour alone. @returns {HTMLElement} */
const soonTag = () => el("span", { class: "soon-tag" }, [t("help.soon")]);

/** Shortcut table generated from the registry; actions that do not exist yet are shown grey with a text tag. @returns {HTMLElement} */
function shortcutsTable() {
  /** @type {Node[][]} */
  const rows = ACTIONS.filter((a) => a.key).map((a) => {
    const name = el("span", {}, [t(a.labelKey)]);
    if (a.soon) name.append(" ", soonTag());
    return [kbd(/** @type {string} */ (a.key)), icon(a.icon), name];
  });
  rows.push([kbd("Esc"), icon("close"), el("span", {}, [t("dialog.close")])]);
  rows.push([kbd("+ − ← → 0"), icon("compare"), el("span", {}, [t("help.chart_keys")])]);
  rows.push([kbd("↑ ↓ PgUp PgDn"), icon("subtract"), el("span", {}, [t("help.factor_keys")])]);
  return table([t("help.col_key"), t("help.col_icon"), t("help.col_action")], rows, "help.tab_keys");
}

/** Legend of the icons: one row per icon used by an action, plus the icons of the results. @returns {HTMLElement} */
function symbolsTable() {
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const a of ACTIONS) if (!names.has(a.icon)) names.set(a.icon, t(a.labelKey));
  names.set("peak-explained", t("help.sym_explained"));
  names.set("peak-unexplained", t("help.sym_unexplained"));
  names.set("warning", t("help.sym_warning"));
  names.set("limits", t("help.sym_limits"));
  return table([t("help.col_icon"), t("help.col_meaning")], [...names].map(([id, name]) => [icon(id), el("span", {}, [name])]), "help.tab_symbols");
}

/** Where the names of LabSolutions and OPUS live here. @returns {HTMLElement} */
function namesTable() {
  const rows = [
    [t("help.names_search_from"), t("help.names_search_to")],
    [t("help.names_score_from"), t("help.names_score_to")],
    [t("help.names_subtract_from"), t("help.names_subtract_to")],
    [t("help.names_residual_from"), t("help.names_residual_to")],
    [t("help.names_peaks_from"), t("help.names_peaks_to")],
  ];
  return table([t("help.names_from"), t("help.names_to")], rows.map(([from, to]) => [el("span", {}, [from]), el("span", {}, [to])]), "help.tab_names");
}

/** Tabs (WAI-ARIA tab pattern: arrows, Home and End move between them). @param {Array<[string, HTMLElement]>} tabs_ [label, content] @returns {HTMLElement} */
function tabs(tabs_) {
  const list = el("div", { role: "tablist", class: "help-tabs", "aria-label": t("help.title") });
  const buttons = tabs_.map(([label], i) => el("button", { type: "button", role: "tab", id: `help-tab-${i}`, "aria-controls": `help-panel-${i}` }, [label]));
  const panels = tabs_.map(([, content], i) => el("div", { role: "tabpanel", id: `help-panel-${i}`, "aria-labelledby": `help-tab-${i}`, tabindex: "0" }, [content]));
  const select = (/** @type {number} */ n, focus = false) => {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === n));
      b.tabIndex = i === n ? 0 : -1;
      panels[i].hidden = i !== n;
    });
    if (focus) buttons[n].focus();
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const last = buttons.length - 1;
      const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[/** @type {"Home"} */ (e.key)];
      if (to === undefined) return;
      e.preventDefault();
      select(to, true);
    });
  });
  list.append(...buttons);
  select(0);
  return el("div", {}, [list, ...panels]);
}

/** The switch of single-key shortcuts (WCAG 2.1.4). @returns {HTMLElement} */
function shortcutsSwitch() {
  const box = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", role: "switch", id: "shortcuts-switch" }));
  box.checked = shortcutsOn();
  box.addEventListener("change", () => setShortcutsOn(box.checked));
  return el("div", { class: "switch-row" }, [box, el("label", { for: "shortcuts-switch" }, [t("help.switch")])]);
}

/** Body of the shortcuts dialog. @returns {Node[]} */
export function helpBody() {
  return [
    shortcutsSwitch(),
    tabs([
      [t("help.tab_keys"), shortcutsTable()],
      [t("help.tab_symbols"), symbolsTable()],
      [t("help.tab_names"), namesTable()],
    ]),
    el("p", { class: "empty" }, [t("help.screen_reader")]),
  ];
}
