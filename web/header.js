// @ts-check
import { actionById } from "./actions.js";
import { actionButton } from "./controls.js";
import { el, icon } from "./dom.js";
import { LANGS, currentLang, formatNumber, t } from "./i18n.js";
import { fileRange } from "./files.js";
import { attachTip } from "./tooltip.js";
import { activeLibraries, getState } from "./state.js";

const DASH = "—";

/** @param {import("./state.js").AppState} s @returns {import("./state.js").FileEntry | undefined} */
export function activeFile(s) {
  return s.files.find((f) => f.code === s.active) ?? s.files[0];
}

/** @param {import("./state.js").FileEntry} f @returns {string} */
function fileChip(f) {
  return `${f.code} · ${fileRange(f)}`;
}

/**
 * Chip definitions: value and tooltip are computed from the state, so the header never keeps its own copy.
 * @type {Array<{ id: string, panel: number, icon: string, labelKey: string, tipKey: string, value: (s: import("./state.js").AppState) => string, tip: (s: import("./state.js").AppState) => string }>}
 */
const CHIPS = [
  {
    id: "file", panel: 1, icon: "file", labelKey: "header.file.label", tipKey: "header.file.tip",
    value: (s) => { const f = activeFile(s); return f ? fileChip(f) : DASH; },
    tip: (s) => { const f = activeFile(s); return f ? `${f.name ?? t("file.demo_name")} · ${t("header.file.points", { points: formatNumber(f.points) })}` : t("header.file.tip"); },
  },
  {
    id: "library", panel: 2, icon: "library", labelKey: "header.library.label", tipKey: "header.library.tip",
    value: (s) => (activeLibraries(s).length ? `${formatNumber(activeLibraries(s).length)} · ${formatNumber(activeLibraries(s).reduce((a, l) => a + l.spectra, 0))}` : DASH),
    tip: (s) => (activeLibraries(s).length ? activeLibraries(s).map((l) => `${l.id} ${l.version}`).join(", ") : t("header.library.tip")),
  },
  { id: "result", panel: 3, icon: "results", labelKey: "header.result.label", tipKey: "header.result.tip", value: (s) => (s.result ? formatNumber(s.result.level) : DASH), tip: () => t("header.result.tip") },
];

/**
 * Build the 48 px header (brand, chips, tools). Built once; `refresh` only rewrites texts and states, so the focus is never lost.
 * @param {HTMLElement} host the <header> element
 * @param {import("./actions.js").Ctx} ctx
 * @param {string} appName
 * @returns {{ refresh: (s: import("./state.js").AppState) => void }}
 */
export function buildHeader(host, ctx, appName) {
  const brand = el("a", { class: "brand", href: "#" }, [el("span", { class: "logo", "aria-hidden": "true" }), el("h1", { id: "app-name" }, [appName])]);
  brand.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0 });
  });
  const chips = el("div", { class: "chips" });
  /** @type {Map<string, HTMLButtonElement>} */
  const chipButtons = new Map();
  for (const c of CHIPS) {
    const b = el("button", { type: "button", class: "chip", "data-chip": c.id }, [icon(c.icon), el("span", { class: "chip-value" })]);
    b.addEventListener("click", () => actionById(`panel.goto.${c.panel}`).run(ctx));
    chipButtons.set(c.id, b);
    chips.append(b);
  }
  const menu = el("button", { type: "button", class: "icon-button menu-button", "aria-expanded": "false", "aria-controls": "hdr-tools" }, [icon("more")]);
  const tools = el("div", { class: "hdr-tools", id: "hdr-tools" });
  const langGroup = el("div", { class: "lang-group", role: "group" });
  /** @type {Map<string, HTMLButtonElement>} */
  const langButtons = new Map();
  for (const code of LANGS) {
    const b = el("button", { type: "button", class: "lang-button", lang: code, "data-lang": code }, [code.toUpperCase()]);
    b.addEventListener("click", () => ctx.setLang(code));
    langButtons.set(code, b);
    langGroup.append(b);
  }
  tools.append(actionButton("privacy.open", ctx), actionButton("info.open", ctx), actionButton("help.open", ctx), langGroup, actionButton("theme.cycle", ctx));
  const closeMenu = () => {
    menu.setAttribute("aria-expanded", "false");
    host.removeAttribute("data-menu");
  };
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    if (open) host.setAttribute("data-menu", "open");
    else host.removeAttribute("data-menu");
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.hasAttribute("data-menu")) {
      closeMenu();
      menu.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (host.hasAttribute("data-menu") && !host.contains(/** @type {Node} */ (e.target))) closeMenu();
  });
  host.append(brand, chips, menu, tools);
  for (const c of CHIPS) {
    const b = /** @type {HTMLButtonElement} */ (chipButtons.get(c.id));
    attachTip(b, () => c.tip(lastState));
  }
  attachTip(menu, () => t("header.menu.label"));
  /** @type {import("./state.js").AppState} */
  let lastState = getState();
  return {
    refresh(s) {
      lastState = s;
      for (const c of CHIPS) {
        const b = /** @type {HTMLButtonElement} */ (chipButtons.get(c.id));
        const value = c.value(s);
        b.querySelector(".chip-value")?.replaceChildren(value);
        b.setAttribute("aria-label", `${t(c.labelKey)}: ${value}`);
      }
      const warn = activeFile(s)?.warnings.length;
      chipButtons.get("file")?.toggleAttribute("data-warn", Boolean(warn));
      menu.setAttribute("aria-label", t("header.menu.label"));
      langGroup.setAttribute("aria-label", t("lang.label"));
      for (const [code, b] of langButtons) {
        b.setAttribute("aria-pressed", String(code === currentLang()));
        b.setAttribute("aria-label", code === "it" ? t("lang.it") : t("lang.en"));
      }
    },
  };
}
