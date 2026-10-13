// @ts-check
import { svg } from "./chart_marks.js";
import { t } from "./i18n.js";

/**
 * The drawing of a vibration mode from `modes/1` (a CH₂ example: it shows the kind of motion, not the molecule of the sample).
 * Animated (1.2 s per cycle) only when `animate` is true; otherwise two still frames, A and B, with arrows. A motion out of the plane of the group
 * is never animated: it is drawn as two frames with ⊙ (towards the viewer) and ⊗ (away from the viewer), so it does not depend on colour or movement.
 * @typedef {import("./bands_data.js").Mode} Mode
 */

const SCALE = 50;
/** Exaggeration of the displacements, so that a 0.16 shift is visible. */
const AMP = 2.5;
const FRAME_W = 170;
const HEIGHT = 140;

/** @param {number[]} xyz @param {number[]} d @param {number} k @param {number} cx @returns {[number, number]} screen position of an atom moved by k × d (y points up in the data) */
function place(xyz, d, k, cx) {
  return [cx + (xyz[0] + k * AMP * d[0]) * SCALE, HEIGHT / 2 + 8 - (xyz[1] + k * AMP * d[1]) * SCALE];
}

/** @param {SVGElement} root @param {import("./bands_data.js").Animation} a @param {number} cx @param {number} k +1 frame A, −1 frame B, 0 rest @param {boolean} arrows */
function drawFrame(root, a, cx, k, arrows) {
  const pos = a.atoms.map((atom, i) => place(atom.xyz, a.displacements[i], k, cx));
  for (const [i, j] of a.bonds) root.append(svg("line", { class: "mode-bond", x1: pos[i][0], y1: pos[i][1], x2: pos[j][0], y2: pos[j][1] }));
  a.atoms.forEach((atom, i) => {
    const rest = place(atom.xyz, a.displacements[i], 0, cx);
    if (arrows && k !== 0 && (a.displacements[i][0] || a.displacements[i][1])) root.append(svg("line", { class: "mode-arrow", x1: rest[0], y1: rest[1], x2: pos[i][0], y2: pos[i][1], "marker-end": "url(#mode-head)" }));
    root.append(svg("circle", { class: `mode-atom mode-${atom.el}`, cx: pos[i][0], cy: pos[i][1], r: atom.el === "C" ? 11 : 8 }));
    const label = svg("text", { class: "mode-el", x: pos[i][0], y: pos[i][1] + 4, "text-anchor": "middle" });
    label.textContent = atom.el;
    root.append(label);
    const dz = a.displacements[i][2] * k;
    if (dz) {
      const sym = svg("text", { class: "mode-z", x: pos[i][0] + 14, y: pos[i][1] - 10 });
      sym.textContent = dz > 0 ? "⊙" : "⊗";
      root.append(sym);
    }
  });
}

/** @returns {SVGElement} the arrow head used by the frames */
function arrowHead() {
  const defs = svg("defs", {});
  const m = svg("marker", { id: "mode-head", viewBox: "0 0 6 6", refX: 5, refY: 3, markerWidth: 6, markerHeight: 6, orient: "auto" });
  m.append(svg("path", { d: "M0 0L6 3L0 6Z", class: "mode-head" }));
  defs.append(m);
  return defs;
}

/** @param {number} frames @returns {SVGElement} */
function canvas(frames) {
  const root = svg("svg", { viewBox: `0 0 ${FRAME_W * frames} ${HEIGHT}`, class: "mode-svg", role: "img" });
  root.append(arrowHead());
  return root;
}

/** @param {SVGElement} root @param {string} text @param {number} cx */
function caption(root, text, cx) {
  const label = svg("text", { class: "label", x: cx, y: HEIGHT - 6, "text-anchor": "middle" });
  label.textContent = text;
  root.append(label);
}

/** Two still frames A and B (arrows from the rest position). @param {Mode} mode @param {import("./bands_data.js").Animation} a @returns {SVGElement} */
function stillFrames(mode, a) {
  const root = canvas(2);
  drawFrame(root, a, FRAME_W / 2, 1, true);
  caption(root, t("mode.frame_a"), FRAME_W / 2);
  drawFrame(root, a, FRAME_W * 1.5, -1, true);
  caption(root, t("mode.frame_b"), FRAME_W * 1.5);
  return root;
}

/** One frame that moves: a loop on animation frames, stopped by `stop`. @param {import("./bands_data.js").Animation} a @returns {{ node: SVGElement, stop: () => void }} */
function movingFrame(a) {
  const root = canvas(1);
  const group = svg("g", {});
  root.append(group);
  let id = 0;
  const step = (/** @type {number} */ now) => {
    const k = Math.sin((2 * Math.PI * now) / (a.period_s * 1000));
    group.replaceChildren();
    drawFrame(/** @type {SVGElement} */ (group), a, FRAME_W / 2, k, false);
    id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return { node: root, stop: () => cancelAnimationFrame(id) };
}

/** The sentence under the figure: what moves and how it is drawn. @param {Mode} mode @param {boolean} moving @returns {string} */
function sentence(mode, moving) {
  if (mode.in_plane === false) return t("mode.out_of_plane");
  return moving ? t("mode.moving") : t("mode.still");
}

/**
 * @param {Mode} mode
 * @param {{ animate: boolean }} opts
 * @returns {{ node: HTMLElement, stop: () => void, animated: boolean } | null} null when the mode has no drawing (it is told in words)
 */
export function modeFigure(mode, opts) {
  const a = mode.animation;
  if (!a) return null;
  const moving = opts.animate && mode.in_plane !== false;
  const drawn = moving ? movingFrame(a) : { node: stillFrames(mode, a), stop: () => {} };
  const name = t("mode.figure_label", { mode: mode.names[/** @type {"it" | "en"} */ (document.documentElement.lang === "it" ? "it" : "en")] });
  drawn.node.setAttribute("aria-label", `${name}. ${sentence(mode, moving)}`);
  const fig = document.createElement("figure");
  fig.className = "mode-figure";
  fig.dataset.animated = String(moving);
  const cap = document.createElement("figcaption");
  cap.textContent = `${sentence(mode, moving)} ${t("mode.example")}`;
  fig.append(drawn.node, cap);
  return { node: fig, stop: drawn.stop, animated: moving };
}
