// @ts-check
// Interactive "spring": two masses and a spring; the wavenumber comes from the engine (Hooke's law), the page only draws.
import { el } from "../dom.js";
import { formatNumber } from "../i18n.js";
import { createLoop, motionAllowed, playButton } from "./anim.js";
import { fill } from "./content.js";
import { figureSvg, label, svg } from "./svg.js";
import { slider, table } from "./ui.js";

/** @typedef {import("./content.js").Interactive} Interactive */
/** @typedef {{ engine: import("../engine.js").Engine }} Ctx */

/** @param {Ctx} ctx @param {number} k @param {number} a @param {number} b @returns {{ mu: number, nu: number } | { error: string }} */
function hooke(ctx, k, a, b) {
  const r = JSON.parse(ctx.engine.didactic_spring(k, a, b));
  return typeof r.error_key === "string" ? { error: r.error_key } : { mu: r.reduced_mass_u, nu: r.wavenumber_cm1 };
}

/** Radius of a mass in the drawing: grows with the cube root of the mass. @param {number} m */
const radius = (m) => 9 + 6 * Math.cbrt(m);

/** Zigzag between x0 and x1 at height y. @param {number} x0 @param {number} x1 @param {number} y */
function zigzag(x0, x1, y) {
  const n = 10;
  const pts = [`${x0},${y}`];
  for (let i = 1; i < n; i++) pts.push(`${(x0 + ((x1 - x0) * i) / n).toFixed(1)},${y + (i % 2 ? -10 : 10)}`);
  pts.push(`${x1},${y}`);
  return pts.join(" ");
}

/**
 * The drawing: masses at the amplitude `swing` (px) around their rest positions; the heavier one moves less.
 * The dashed outlines are the extreme position, so the still picture also says that the atoms move.
 * @param {Interactive} spec
 * @returns {{ svg: SVGSVGElement, draw: (m1: number, m2: number, swing: number) => void }}
 */
function buildDrawing(spec) {
  const root = figureSvg(420, 130, spec.labels.svg_title, spec.labels.svg_desc);
  const spring = svg("polyline", { class: "fig-line", fill: "none" });
  const ghost1 = svg("circle", { class: "fig-ghost" });
  const ghost2 = svg("circle", { class: "fig-ghost" });
  const c1 = svg("circle", { class: "fig-mass" });
  const c2 = svg("circle", { class: "fig-mass fig-mass-b" });
  root.append(spring, ghost1, ghost2, c1, c2, label(spec.labels.ghost, 210, 122, { "text-anchor": "middle" }));
  const y = 55;
  const rest = [130, 290];
  const reach = 24;
  /** @param {SVGElement} node @param {number} cx @param {number} r */
  const place = (node, cx, r) => {
    node.setAttribute("cx", cx.toFixed(1));
    node.setAttribute("cy", String(y));
    node.setAttribute("r", r.toFixed(1));
  };
  /** @param {number} m1 @param {number} m2 @param {number} swing */
  const draw = (m1, m2, swing) => {
    // momentum is conserved: the displacements are inversely proportional to the masses
    const share1 = m2 / (m1 + m2);
    const share2 = m1 / (m1 + m2);
    place(c1, rest[0] + swing * share1, radius(m1));
    place(c2, rest[1] - swing * share2, radius(m2));
    place(ghost1, rest[0] + reach * share1, radius(m1));
    place(ghost2, rest[1] - reach * share2, radius(m2));
    spring.setAttribute("points", zigzag(rest[0] + swing * share1 + radius(m1), rest[1] - swing * share2 - radius(m2), y));
  };
  return { svg: root, draw };
}

/**
 * @param {HTMLElement} host
 * @param {Interactive} spec labels, presets in `items` (`params` = [k, mass A, mass B])
 * @param {Ctx} ctx
 */
export function mountSpring(host, spec, ctx) {
  const L = spec.labels;
  const presets = spec.items ?? [];
  const state = { k: 500, a: 12.011, b: 1.008 };
  const result = el("p", { class: "result", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const drawing = buildDrawing(spec);
  const f = (/** @type {number} */ v) => formatNumber(v, v < 10 ? 1 : 0);
  const sk = slider({ label: L.k, min: 100, max: 2000, step: 10, value: state.k, format: (v) => `${formatNumber(v)} N/m`, onInput: (v) => update({ k: v }) });
  const sa = slider({ label: L.m1, min: 1, max: 40, step: 0.5, value: state.a, format: (v) => `${f(v)} u`, onInput: (v) => update({ a: v }) });
  const sb = slider({ label: L.m2, min: 1, max: 40, step: 0.5, value: state.b, format: (v) => `${f(v)} u`, onInput: (v) => update({ b: v }) });
  const loop = createLoop((p) => drawing.draw(state.a, state.b, 24 * Math.sin(2 * Math.PI * p)), 1200);
  /** @param {Partial<typeof state>} change */
  const update = (change) => {
    Object.assign(state, change);
    const r = hooke(ctx, state.k, state.a, state.b);
    if ("error" in r) {
      result.textContent = L.error;
      return;
    }
    result.textContent = fill(L.result, { mu: formatNumber(r.mu, 2), nu: formatNumber(r.nu, 0) });
    drawing.draw(state.a, state.b, 0);
  };
  const buttons = el("div", { class: "choice" });
  for (const p of presets) {
    const b = el("button", { type: "button", class: "btn" }, [p.label]);
    b.addEventListener("click", () => {
      const [k, a, bb] = (p.params ?? []);
      sk.set(k);
      sa.set(a);
      sb.set(bb);
      update({ k, a, b: bb });
    });
    buttons.append(b);
  }
  const rows = presets.map((p) => {
    const [k, a, b] = (p.params ?? []);
    const r = hooke(ctx, k, a, b);
    return "error" in r ? [p.label, "", "", "", p.value] : [p.label, formatNumber(k), formatNumber(r.mu, 2), formatNumber(r.nu, 0), p.value];
  });
  const controls = el("div", { class: "controls" }, [el("p", { class: "hint" }, [L.presets]), buttons, sk.row, sa.row, sb.row]);
  const play = playButton(loop);
  if (motionAllowed()) controls.append(play.button);
  host.append(drawing.svg, controls, result, el("p", { class: "note" }, [L.note]), table(L.table_caption, [L.col_bond, L.col_k, L.col_mu, L.col_calc, L.col_obs], rows));
  update({});
  if (motionAllowed()) loop.start();
  play.refresh();
}
