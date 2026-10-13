// @ts-check
// One chapter: key message, text for everyone, figure (or interactive) with its data table, box for chemists, sources.
import { el } from "../dom.js";
import { t } from "../i18n.js";
import { buildFigure } from "./figures.js";
import { inline } from "./content.js";
import { mountDipole } from "./dipole.js";
import { mountModes } from "./modes.js";
import { mountSpring } from "./spring.js";
import { table } from "./ui.js";

/** @typedef {import("./content.js").Chapter} Chapter */
/** @typedef {import("./content.js").Source} Source */
/** @typedef {import("./content.js").IndexEntry} IndexEntry */
/** @typedef {{ engine: Promise<import("../engine.js").Engine> }} Ctx */

/** @param {Source} s @param {boolean} withLicence @returns {HTMLElement} */
function sourceItem(s, withLicence) {
  const li = el("li");
  if (s.url) li.append(el("a", { href: s.url, rel: "noopener noreferrer", class: "external" }, [s.title]), ` ${t("teoria.external")}`);
  else li.append(s.title);
  if (withLicence && s.license) li.append(` — ${s.license}`);
  return li;
}

/**
 * Interactive or static figure and its caption and data table.
 * @param {Chapter} ch @param {Ctx} ctx
 * @returns {HTMLElement}
 */
function figureBlock(ch, ctx) {
  const fig = el("figure", { class: "theory-figure" });
  const stage = el("div", { class: "stage", "aria-busy": "true" });
  fig.append(stage, el("figcaption", {}, [ch.figure.caption]));
  const spec = ch.interactive;
  const done = () => stage.setAttribute("aria-busy", "false");
  const fail = () => {
    stage.replaceChildren(el("p", { class: "error", role: "alert" }, [t("teoria.figure_error")]));
    done();
  };
  ctx.engine
    .then(async (engine) => {
      if (spec) {
        const mount = { spring: mountSpring, modes: mountModes, dipole: mountDipole }[/** @type {"spring" | "modes" | "dipole"} */ (spec.id)];
        await mount(stage, spec, { engine });
      } else {
        const svg = await buildFigure(ch.figure, { engine });
        if (svg) stage.append(svg);
      }
      done();
    })
    .catch(fail);
  const dt = ch.figure.data_table;
  if (dt) fig.append(el("details", { class: "figure-data" }, [el("summary", {}, [t("teoria.figure_data")]), table(dt.caption, dt.columns, dt.rows)]));
  return fig;
}

/**
 * @param {HTMLElement} host
 * @param {Chapter} ch
 * @param {{ chapters: IndexEntry[], sources: Map<string, Source>, ctx: Ctx }} env
 * @returns {HTMLElement} the heading, to focus after a navigation
 */
export function renderChapter(host, ch, env) {
  const title = el("h2", { id: "view-title", tabindex: "-1" }, [`${ch.n}. ${ch.title}`]);
  const body = ch.body.map((p) => el("p", {}, inline(p)));
  const chem = el("details", { class: "for-chemists" }, [el("summary", {}, [t("teoria.for_chemists")]), ...ch.for_chemists.map((p) => el("p", {}, inline(p)))]);
  const used = ch.sources.map((id) => env.sources.get(id)).filter((s) => s !== undefined);
  const more = ch.further_reading.map((id) => env.sources.get(id)).filter((s) => s !== undefined);
  const nav = el("nav", { class: "pager", "aria-label": t("teoria.pager") });
  const prev = env.chapters.find((c) => c.n === ch.n - 1);
  const next = env.chapters.find((c) => c.n === ch.n + 1);
  if (prev) nav.append(el("a", { href: `#${prev.n}`, rel: "prev" }, [`← ${prev.n}. ${prev.title}`]));
  nav.append(el("a", { href: "#" }, [t("teoria.to_index")]));
  if (next) nav.append(el("a", { href: `#${next.n}`, rel: "next" }, [`${next.n}. ${next.title} →`]));
  host.replaceChildren(
    title,
    el("p", { class: "key-message" }, [el("strong", {}, [ch.key_message])]),
    ...body,
    figureBlock(ch, env.ctx),
    chem,
    ...(used.length ? [el("h3", {}, [t("teoria.sources")]), el("ul", { class: "sources" }, used.map((s) => sourceItem(s, false)))] : []),
    ...(more.length ? [el("h3", {}, [t("teoria.further")]), el("ul", { class: "sources" }, more.map((s) => sourceItem(s, true)))] : []),
    nav,
  );
  return title;
}
