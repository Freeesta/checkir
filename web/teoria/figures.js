// @ts-check
// Static figures of the chapters, drawn as SVG from the data of the page (spectra of data/demo/, labels of the chapter file).
import { formatNumber } from "../i18n.js";
import { parseDocument } from "../spectrum.js";
import { arrow } from "./modes.js";
import { decimate, figureSvg, label, pathOf, scale, svg } from "./svg.js";

/** @typedef {import("./content.js").Figure} Figure */
/** @typedef {{ engine: import("../engine.js").Engine }} Ctx */

const BUDGET = { maxBytes: 32 * 1024 * 1024, maxPoints: 1 << 20 };

/** @type {Map<string, Promise<{ x: number[], y: number[] }>>} */
const spectra = new Map();

/**
 * A DEMO spectrum (public, cleaned) read by the engine like any file.
 * @param {Ctx} ctx @param {string} name file in `dati/`
 * @returns {Promise<{ x: number[], y: number[] }>}
 */
function demoSpectrum(ctx, name) {
  let p = spectra.get(name);
  if (!p) {
    p = fetch(new URL(`dati/${name}`, import.meta.url))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const doc = parseDocument(ctx.engine.open_file(name, new Uint8Array(buf), BUDGET.maxBytes, BUDGET.maxPoints));
        if ("error" in doc) throw new Error(doc.error.key);
        return { x: doc.spectrum.wavenumber_cm1, y: doc.spectrum.y };
      });
    p.catch(() => spectra.delete(name));
    spectra.set(name, p);
  }
  return p;
}

const W = 460;
const H = 250;
const M = { l: 44, r: 12, t: 14, b: 52 };

/**
 * Frame of a spectrum plot: the x axis decreases from left to right.
 * @param {SVGSVGElement} root @param {Record<string, string>} L @param {number} yMax
 * @returns {{ sx: (v: number) => number, sy: (v: number) => number }}
 */
function axes(root, L, yMax) {
  const sx = scale(4000, 500, M.l, W - M.r);
  const sy = scale(0, yMax, H - M.b, M.t);
  root.append(svg("line", { class: "fig-axis", x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b }), svg("line", { class: "fig-axis", x1: M.l, y1: M.t, x2: M.l, y2: H - M.b }));
  for (const v of [4000, 3000, 2000, 1500, 1000, 500]) {
    root.append(svg("line", { class: "fig-axis", x1: sx(v), y1: H - M.b, x2: sx(v), y2: H - M.b + 4 }), label(formatNumber(v), sx(v), H - M.b + 16, { "text-anchor": "middle" }));
  }
  root.append(label(L.axis_x, (M.l + W - M.r) / 2, H - M.b + 32, { "text-anchor": "middle" }), label(L.axis_note, (M.l + W - M.r) / 2, H - M.b + 46, { "text-anchor": "middle", class: "fig-text fig-muted" }));
  root.append(label(L.axis_y, 12, H / 2 - 20, { transform: `rotate(-90 12 ${H / 2 - 20})`, "text-anchor": "middle" }));
  return { sx, sy };
}

/** @param {{ x: number[], y: number[] }} s @param {(v: number) => number} sx @param {(v: number) => number} sy @param {string} cls @returns {SVGElement} */
function curve(s, sx, sy, cls) {
  const pts = decimate(s.x, s.y, 500, 4000, 6).map(/** @returns {[number, number]} */ ([x, y]) => [sx(x), sy(y)]);
  return svg("path", { class: cls, fill: "none", d: pathOf(pts) });
}

/** Chapter 1: one DEMO spectrum with three bands named, and the box of what FTIR does not see. @param {Figure} f @param {Ctx} ctx */
async function spectrumBands(f, ctx) {
  const L = f.labels ?? {};
  const s = await demoSpectrum(ctx, "demo-01.jdx");
  const root = figureSvg(W, H, L.title, f.alt);
  const { sx, sy } = axes(root, L, 1);
  root.append(curve(s, sx, sy, "fig-line fig-sample"));
  for (const [pos, key, y] of /** @type {Array<[number, string, number]>} */ ([[2540, "band1", 0.1], [1712, "band2", 0.56], [729, "band3", 0.66]])) {
    root.append(svg("line", { class: "fig-axis fig-dash", x1: sx(pos), y1: sy(y), x2: sx(pos), y2: M.t + 4 }), label(L[key], sx(pos), M.t + 2, { "text-anchor": pos > 1000 ? "middle" : "end", class: "fig-text fig-strong" }));
  }
  root.append(label(L.demo, M.l + 8, M.t + 12, { class: "fig-text fig-muted" }));
  return root;
}

/** Chapter 5: salt and free base of the same molecule, two DEMO spectra on one axis (line style, not only colour). @param {Figure} f @param {Ctx} ctx */
async function saltBase(f, ctx) {
  const L = f.labels ?? {};
  const [salt, base] = await Promise.all([demoSpectrum(ctx, "demo-01.jdx"), demoSpectrum(ctx, "demo-02.jdx")]);
  const root = figureSvg(W, H, L.title, f.alt);
  const { sx, sy } = axes(root, L, 1);
  root.append(curve(base, sx, sy, "fig-line fig-reference fig-dash"), curve(salt, sx, sy, "fig-line fig-sample"));
  root.append(svg("rect", { class: "fig-band", x: sx(3200), y: M.t, width: sx(2300) - sx(3200), height: H - M.b - M.t }), label(L.region, (sx(3200) + sx(2300)) / 2, M.t + 12, { "text-anchor": "middle", class: "fig-text fig-strong" }));
  root.append(label(L.salt, W - M.r, M.t + 10, { "text-anchor": "end", class: "fig-text fig-strong" }), label(L.base, W - M.r, M.t + 24, { "text-anchor": "end", class: "fig-text fig-strong" }), label(L.demo, W - M.r, M.t + 38, { "text-anchor": "end", class: "fig-text fig-muted" }));
  return root;
}

/** @param {SVGSVGElement} root @param {number} x @param {number} y @param {number} w @param {number} h @param {string} text */
function box(root, x, y, w, h, text) {
  root.append(svg("rect", { class: "fig-box", x, y, width: w, height: h, rx: 4 }), label(text, x + w / 2, y + h / 2 + 4, { "text-anchor": "middle" }));
}

/** Chapter 6: the optical bench, drawn schematically. @param {Figure} f */
function instrument(f) {
  const L = f.labels ?? {};
  const root = figureSvg(W, 290, L.title, f.alt);
  const bx = 220;
  const by = 120;
  box(root, 6, by - 18, 82, 36, L.source);
  box(root, bx - 45, 6, 90, 30, L.fixed);
  box(root, 356, by - 18, 98, 36, L.moving);
  box(root, bx - 45, 196, 90, 30, L.sample);
  box(root, bx - 45, 250, 90, 30, L.detector);
  box(root, 6, 196, 82, 36, L.laser);
  root.append(svg("line", { class: "fig-bs", x1: bx - 18, y1: by + 18, x2: bx + 18, y2: by - 18 }), label(L.splitter, bx - 24, by + 38, { "text-anchor": "end" }));
  root.append(arrow(88, by, bx - 20, by, "fig-ray"), arrow(bx, by - 20, bx, 38, "fig-ray"), arrow(bx + 20, by, 354, by, "fig-ray"), arrow(bx, by + 20, bx, 194, "fig-ray"), arrow(bx, 228, bx, 248, "fig-ray"));
  root.append(svg("line", { class: "fig-axis fig-dash", x1: 88, y1: 214, x2: bx - 16, y2: by + 14 }), svg("line", { class: "fig-axis", x1: 394, y1: by + 22, x2: 418, y2: by + 22 }), label(L.moves, 406, by + 38, { "text-anchor": "middle", class: "fig-text fig-muted" }));
  return root;
}

/**
 * The SVG of the figure named in the chapter file.
 * @param {Figure} f @param {Ctx} ctx
 * @returns {Promise<SVGSVGElement | null>} null for the figures that belong to an interactive
 */
export async function buildFigure(f, ctx) {
  if (f.id === "spectrum_bands") return /** @type {SVGSVGElement} */ (await spectrumBands(f, ctx));
  if (f.id === "salt_base") return /** @type {SVGSVGElement} */ (await saltBase(f, ctx));
  if (f.id === "instrument") return /** @type {SVGSVGElement} */ (instrument(f));
  return null;
}
