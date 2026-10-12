// @ts-check
import { formatNumber, t } from "./i18n.js";
import { indiciVisibili } from "./spettro.js";
import { dentro, sposta, zoom } from "./vista.js";

/** @typedef {import("./spettro.js").Spettro} Spettro */
/** @typedef {import("./vista.js").Vista} Vista */

const NS = "http://www.w3.org/2000/svg";
const W = 800;
const H = 360;
const M = { l: 56, r: 16, t: 12, b: 44 };
const MAX_RIGHE = 400;

/**
 * @param {string} nome
 * @param {Record<string, string | number>} attr
 * @returns {SVGElement}
 */
function svg(nome, attr) {
  const el = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attr)) el.setAttribute(k, String(v));
  return el;
}

/**
 * @param {number} lo
 * @param {number} hi
 * @param {number} n
 * @returns {number[]}
 */
function tacche(lo, hi, n) {
  const passo = (hi - lo) / n;
  const grezzo = 10 ** Math.floor(Math.log10(passo));
  const bello = [1, 2, 5, 10].map((k) => k * grezzo).find((p) => p >= passo) ?? passo;
  const out = [];
  for (let v = Math.ceil(lo / bello) * bello; v <= hi + 1e-9; v += bello) out.push(v);
  return out;
}

/**
 * Draw the chart into `host`: SVG with axes, ticks and the curve; x axis runs from high to low wavenumber.
 * @param {HTMLElement} host
 * @param {Spettro} s
 * @param {Vista} v
 */
export function disegna(host, s, v) {
  const idx = indiciVisibili(s, v.min, v.max);
  const ys = idx.map((i) => s.y[i]);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys) * 1.05 || 1;
  const px = (/** @type {number} */ x) => M.l + ((v.max - x) / (v.max - v.min)) * (W - M.l - M.r);
  const py = (/** @type {number} */ y) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("grafico.titolo") });
  for (const x of tacche(v.min, v.max, 8)) {
    root.append(svg("line", { class: "griglia", x1: px(x), x2: px(x), y1: M.t, y2: H - M.b }));
    const e = svg("text", { class: "etichetta", x: px(x), y: H - M.b + 16, "text-anchor": "middle" });
    e.textContent = formatNumber(x);
    root.append(e);
  }
  for (const y of tacche(y0, y1, 5)) {
    root.append(svg("line", { class: "griglia", x1: M.l, x2: W - M.r, y1: py(y), y2: py(y) }));
    const e = svg("text", { class: "etichetta", x: M.l - 6, y: py(y) + 4, "text-anchor": "end" });
    e.textContent = formatNumber(y, 1);
    root.append(e);
  }
  root.append(svg("rect", { class: "asse", x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }));
  root.append(svg("polyline", { class: "curva", points: idx.map((i) => `${px(s.numero_onda_cm1[i])},${py(s.y[i])}`).join(" ") }));
  const ex = svg("text", { class: "etichetta", x: W / 2, y: H - 6, "text-anchor": "middle" });
  ex.textContent = t("grafico.asse_x");
  const ey = svg("text", { class: "etichetta", x: 14, y: H / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${H / 2})` });
  ey.textContent = t("grafico.asse_y");
  root.append(ex, ey);
  host.replaceChildren(root);
}

/**
 * Accessible table with the points in the view (thinned to at most MAX_RIGHE rows).
 * @param {HTMLElement} host
 * @param {Spettro} s
 * @param {Vista} v
 */
export function tabella(host, s, v) {
  const idx = indiciVisibili(s, v.min, v.max);
  const salto = Math.max(1, Math.ceil(idx.length / MAX_RIGHE));
  const tab = document.createElement("table");
  const cap = tab.createCaption();
  cap.textContent = t("tabella.didascalia");
  const riga = tab.createTHead().insertRow();
  for (const nome of [t("tabella.numero_onda"), t("tabella.assorbanza")]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = nome;
    riga.append(th);
  }
  const corpo = tab.createTBody();
  for (let j = 0; j < idx.length; j += salto) {
    const r = corpo.insertRow();
    r.insertCell().textContent = formatNumber(s.numero_onda_cm1[idx[j]]);
    r.insertCell().textContent = formatNumber(s.y[idx[j]], 4);
  }
  host.replaceChildren(tab);
}

/**
 * Wire the chart: keyboard (+ - arrows 0) and buttons, both without any drag.
 * @param {{ grafico: HTMLElement, barra: HTMLElement, tab: HTMLElement, intervallo: HTMLElement }} el
 * @param {Spettro} s
 * @returns {() => void} redraw (call after a language change)
 */
export function collega(el, s) {
  const xs = s.numero_onda_cm1;
  const intera = { min: Math.min(...xs), max: Math.max(...xs) };
  let v = { ...intera };
  const aggiorna = () => {
    disegna(el.grafico, s, v);
    tabella(el.tab, s, v);
    el.intervallo.textContent = t("grafico.intervallo", { da: formatNumber(v.min), a: formatNumber(v.max) });
  };
  /** @type {Array<[string, () => string, () => Vista]>} */
  const azioni = [
    ["+", () => t("grafico.zoom_avanti"), () => zoom(v, intera, 0.5)],
    ["−", () => t("grafico.zoom_indietro"), () => zoom(v, intera, 2)],
    ["←", () => t("grafico.sposta_sinistra"), () => sposta(v, intera, -0.25)],
    ["→", () => t("grafico.sposta_destra"), () => sposta(v, intera, 0.25)],
    ["0", () => t("grafico.azzera"), () => dentro({ ...intera }, intera)],
  ];
  const chiavi = { "+": 0, "=": 0, "-": 1, ArrowLeft: 2, ArrowRight: 3, "0": 4 };
  const applica = (/** @type {number} */ i) => {
    v = azioni[i][2]();
    aggiorna();
  };
  el.barra.replaceChildren(
    ...azioni.map(([simbolo, chiave], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = simbolo;
      b.setAttribute("aria-label", chiave());
      b.title = chiave();
      b.addEventListener("click", () => applica(i));
      return b;
    }),
  );
  el.grafico.addEventListener("keydown", (e) => {
    const i = chiavi[/** @type {keyof typeof chiavi} */ (e.key)];
    if (i === undefined) return;
    e.preventDefault();
    applica(i);
  });
  aggiorna();
  return aggiorna;
}
