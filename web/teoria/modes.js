// @ts-check
// Interactive "modes": the six vibrations of a CH2 group. Geometry from modes/1 (data/bands/modes.json), frames from the engine.
import { el } from "../dom.js";
import { createLoop, motionAllowed, playButton } from "./anim.js";
import { loadJson } from "./content.js";
import { figureSvg, label, svg } from "./svg.js";
import { choice, slider, table } from "./ui.js";

/** @typedef {import("./content.js").Interactive} Interactive */
/** @typedef {{ engine: import("../engine.js").Engine }} Ctx */
/** @typedef {{ atoms: Array<{ el: string, xyz: number[] }>, bonds: number[][], displacements: number[][] }} Animation */

const FRAMES = 24;
const EXAGGERATE = 2.5;
const SCALE = 90;
const CENTRE = [150, 100];

/** Pixel position of an atom position (y points up in the data). @param {number[]} p @returns {[number, number]} */
const px = (p) => [CENTRE[0] + p[0] * SCALE, CENTRE[1] - p[1] * SCALE];

/** Arrow from (x0, y0) to (x1, y1) with a small head. @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string} [cls] */
export function arrow(x0, y0, x1, y1, cls = "fig-arrow") {
  const g = svg("g", { class: cls });
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = [x1, y1, x1 - 7 * Math.cos(a - 0.45), y1 - 7 * Math.sin(a - 0.45), x1 - 7 * Math.cos(a + 0.45), y1 - 7 * Math.sin(a + 0.45)];
  g.append(svg("line", { x1: x0, y1: y0, x2: x1, y2: y1 }), svg("polygon", { points: head.map((v) => v.toFixed(1)).join(" ") }));
  return g;
}

/**
 * @param {Ctx} ctx @param {Animation} anim
 * @returns {Array<{ positions: number[][] }>}
 */
function frames(ctx, anim) {
  const atoms = anim.atoms.map((a, i) => ({ el: a.el, xyz: a.xyz, displacement: anim.displacements[i].map((v) => v * EXAGGERATE) }));
  return JSON.parse(ctx.engine.didactic_vibration_frames(JSON.stringify(atoms), FRAMES)).frames;
}

/**
 * @param {HTMLElement} host
 * @param {Interactive} spec labels and one item per mode (`id` = id in modes/1)
 * @param {Ctx} ctx
 */
export async function mountModes(host, spec, ctx) {
  const L = spec.labels;
  const catalog = await loadJson("dati/modes.json");
  /** @type {Map<string, Animation>} */
  const byId = new Map(catalog.modes.filter((/** @type {any} */ m) => m.animation).map((/** @type {any} */ m) => [m.id, m.animation]));
  const items = (spec.items ?? []).filter((i) => byId.has(i.id));
  const root = figureSvg(300, 140, L.svg_title, L.svg_desc);
  const layer = svg("g");
  root.append(layer);
  const info = el("p", { class: "result", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  let current = items[0];
  let list = frames(ctx, /** @type {Animation} */ (byId.get(current.id)));
  let index = 0;
  const draw = () => {
    const anim = /** @type {Animation} */ (byId.get(current.id));
    layer.replaceChildren();
    const pos = list[index].positions;
    for (const [a, b] of anim.bonds) layer.append(svg("line", { class: "fig-bond", x1: px(pos[a])[0], y1: px(pos[a])[1], x2: px(pos[b])[0], y2: px(pos[b])[1] }));
    anim.atoms.forEach((atom, i) => {
      const [x, y] = px(pos[i]);
      const r = (atom.el === "C" ? 15 : 10) * (1 + 0.3 * pos[i][2]);
      layer.append(svg("circle", { class: atom.el === "C" ? "fig-atom-c" : "fig-atom-h", cx: x, cy: y, r }), label(atom.el, x, y + 4, { "text-anchor": "middle" }));
      const d = anim.displacements[i];
      if (d[2] !== 0) layer.append(label(pos[i][2] > 0 ? L.toward : L.away, x, y - 18, { "text-anchor": "middle", class: "fig-text fig-strong" }));
      else if (d[0] !== 0 || d[1] !== 0) {
        const [x0, y0] = px(anim.atoms[i].xyz);
        for (const sign of [1, -1]) {
          const [x1, y1] = px(anim.atoms[i].xyz.map((v, k) => v + sign * d[k] * EXAGGERATE * 0.9));
          layer.append(arrow(x0, y0, x1, y1));
        }
      }
    });
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
    list = frames(ctx, /** @type {Animation} */ (byId.get(id)));
    info.textContent = `${current.label}: ${current.text} ${L.where} ${current.value}.`;
    draw();
  };
  const pick = choice(L.choose, items.map((i) => ({ id: i.id, label: i.label })), current.id, choose);
  const controls = el("div", { class: "controls" }, [pick.group, frame.row]);
  const play = playButton(loop);
  if (motionAllowed()) controls.append(play.button);
  host.append(root, controls, info, el("p", { class: "note" }, [L.note]), table(L.table_caption, [L.col_mode, L.col_where], items.map((i) => [i.label, i.value])));
  choose(current.id);
  if (motionAllowed()) loop.start();
  play.refresh();
}
