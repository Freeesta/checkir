// @ts-check
// Interactive "dipole": a vibration absorbs infrared only if the dipole moment changes. Frames and activity come from the engine.
import { el } from "../dom.js";
import { createLoop, motionAllowed, playButton } from "./anim.js";
import { fill, loadJson } from "./content.js";
import { arrow } from "./modes.js";
import { figureSvg, label, pathOf, svg } from "./svg.js";
import { choice, slider, table } from "./ui.js";

/** @typedef {import("./content.js").Interactive} Interactive */
/** @typedef {{ engine: import("../engine.js").Engine }} Ctx */
/** @typedef {{ frames: Array<{ positions: number[][], dipole: number[] }>, dipole_change: number[], ir_active: boolean }} Run */

const FRAMES = 24;
const SCALE = 62;
const ARROW = 110;

/**
 * Engine run of one mode of one molecule.
 * @param {Ctx} ctx @param {any} molecule @param {any} mode
 * @returns {Run}
 */
function run(ctx, molecule, mode) {
  const atoms = molecule.atoms.map((/** @type {any} */ a, /** @type {number} */ i) => ({ el: a.el, xyz: a.xyz, charge: a.charge, displacement: mode.displacements[i] }));
  return JSON.parse(ctx.engine.didactic_vibration_frames(JSON.stringify(atoms), FRAMES));
}

/** Sign of the partial charge, written as text next to the atom (never colour alone). @param {number} q */
const sign = (q) => (q > 0 ? "δ+" : q < 0 ? "δ−" : "");

/**
 * @param {HTMLElement} host
 * @param {Interactive} spec one item per mode, `id` = `<molecule>.<mode>`
 * @param {Ctx} ctx
 */
export async function mountDipole(host, spec, ctx) {
  const L = spec.labels;
  const data = await loadJson("dati/molecules.json");
  /** @type {Map<string, { molecule: any, mode: any, run: Run }>} */
  const runs = new Map();
  for (const m of data.molecules) for (const mode of m.modes) runs.set(`${m.id}.${mode.id}`, { molecule: m, mode, run: run(ctx, m, mode) });
  const items = (spec.items ?? []).filter((i) => runs.has(i.id));
  const root = figureSvg(300, 216, L.svg_title, L.svg_desc);
  const layer = svg("g");
  root.append(layer);
  const info = el("p", { class: "result", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  let current = items[0];
  let index = 0;
  const draw = () => {
    const r = /** @type {{ molecule: any, run: Run }} */ (runs.get(current.id));
    const f = r.run.frames[index];
    layer.replaceChildren();
    const centre = [150, r.molecule.id === "co2" ? 55 : 72];
    r.molecule.atoms.forEach((/** @type {any} */ a, /** @type {number} */ i) => {
      const x = centre[0] + f.positions[i][0] * SCALE;
      const y = centre[1] - f.positions[i][1] * SCALE;
      layer.append(svg("circle", { class: a.el === "C" ? "fig-atom-c" : "fig-atom-h", cx: x, cy: y, r: a.el === "H" ? 10 : 14 }), label(a.el, x, y + 4, { "text-anchor": "middle" }), label(sign(a.charge), x, y - 20, { "text-anchor": "middle", class: "fig-text fig-strong" }));
    });
    const base = r.molecule.atoms.reduce((/** @type {number[]} */ acc, /** @type {any} */ a) => acc.map((v, k) => v + a.charge * a.xyz[k]), [0, 0, 0]);
    const dx = (f.dipole[0] - base[0]) * ARROW;
    const dy = (f.dipole[1] - base[1]) * ARROW;
    layer.append(label(L.dipole, 150, 118, { "text-anchor": "middle" }));
    if (Math.hypot(dx, dy) > 1) layer.append(arrow(150 - dx / 2, 136 - dy / 2, 150 + dx / 2, 136 + dy / 2));
    else layer.append(svg("circle", { class: "fig-dot", cx: 150, cy: 136, r: 3 }), label(L.zero, 150, 154, { "text-anchor": "middle" }));
    layer.append(label(L.time, 150, 172, { "text-anchor": "middle" }), ...sparkline(r.run, index));
  };
  const frame = slider({ label: L.phase, min: 0, max: FRAMES - 1, step: 1, value: 0, format: (v) => `${Math.round((v / FRAMES) * 360)}°`, onInput: (v) => {
    index = v;
    draw();
  } });
  const loop = createLoop((p) => {
    index = Math.floor(p * FRAMES) % FRAMES;
    frame.set(index);
    draw();
  }, 2400);
  /** @param {string} id */
  const choose = (id) => {
    current = /** @type {import("./content.js").Item} */ (items.find((i) => i.id === id));
    const active = /** @type {{ run: Run }} */ (runs.get(id)).run.ir_active;
    info.textContent = fill(active ? L.active : L.inactive, { mode: current.label });
    draw();
  };
  const pick = choice(L.choose, items.map((i) => ({ id: i.id, label: i.label })), current.id, choose);
  const controls = el("div", { class: "controls" }, [pick.group, frame.row]);
  const play = playButton(loop);
  if (motionAllowed()) controls.append(play.button);
  const rows = items.map((i) => [i.label, /** @type {{ run: Run }} */ (runs.get(i.id)).run.ir_active ? L.yes : L.no, i.value]);
  host.append(root, controls, info, el("p", { class: "note" }, [L.note]), table(L.table_caption, [L.col_mode, L.col_active, L.col_obs], rows));
  choose(current.id);
  if (motionAllowed()) loop.start();
  play.refresh();
}

/**
 * Dipole along its main axis over one period (a sine for an active mode, a flat line for an inactive one) with the current phase.
 * @param {Run} r @param {number} index
 * @returns {SVGElement[]}
 */
function sparkline(r, index) {
  const change = r.dipole_change;
  const axis = Math.abs(change[0]) >= Math.abs(change[1]) ? 0 : 1;
  const top = 178;
  const mid = 196;
  const pts = /** @type {Array<[number, number]>} */ (r.frames.map((f, i) => [30 + (i / (FRAMES - 1)) * 240, mid - (f.dipole[axis] - r.frames[0].dipole[axis]) * 28]));
  const cx = 30 + (index / (FRAMES - 1)) * 240;
  return [svg("line", { class: "fig-axis", x1: 30, y1: mid, x2: 270, y2: mid }), svg("path", { class: "fig-line", fill: "none", d: pathOf(pts) }), svg("circle", { class: "fig-dot", cx, cy: pts[index][1], r: 4 }), svg("line", { class: "fig-axis", x1: cx, y1: top, x2: cx, y2: top + 36 })];
}
