// @ts-check
import { download } from "./export.js";
import { t } from "./i18n.js";
import { activeFile, getState } from "./state.js";

/**
 * Export of the chart as a picture, entirely in the page: the SVG on screen is copied with the colours and strokes it has now written inline
 * (a file opened elsewhere has no style sheet), without the cursor hit areas, then offered as SVG or drawn on a canvas for the PNG.
 * The file is named by the local code (C1.svg, C1.png), never by the original file.
 */

const PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline"];
const DROP = ".axis-hit-x, .axis-hit-y, .zoom-box, .cursor-hover";
const SCALE = 2;

/** Copy the computed look of `from` onto `to`, element by element (the two trees have the same shape). @param {Element} from @param {Element} to */
function inlineStyles(from, to) {
  const css = getComputedStyle(from);
  if (css.display === "none") return void to.remove();
  if (to instanceof SVGElement || to instanceof HTMLElement) for (const p of PROPS) to.style.setProperty(p, css.getPropertyValue(p));
  const kids = [...to.children];
  [...from.children].forEach((k, i) => kids[i] && inlineStyles(k, kids[i]));
}

/** @param {SVGSVGElement} chart @returns {{ text: string, width: number, height: number }} a stand-alone SVG document */
export function chartSvg(chart) {
  const copy = /** @type {SVGSVGElement} */ (chart.cloneNode(true));
  inlineStyles(chart, copy);
  copy.querySelectorAll(DROP).forEach((n) => n.remove());
  const box = chart.viewBox.baseVal;
  const { width, height } = box;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("role");
  copy.removeAttribute("aria-label");
  copy.removeAttribute("class");
  copy.removeAttribute("style");
  const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [k, v] of Object.entries({ x: "0", y: "0", width: String(width), height: String(height), fill: getComputedStyle(document.body).backgroundColor })) back.setAttribute(k, v);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = chart.getAttribute("aria-label") ?? "";
  copy.prepend(back);
  copy.prepend(title);
  return { text: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}\n`, width, height };
}

/** @param {string} svgText @param {number} width @param {number} height @returns {Promise<Blob>} the picture drawn at twice its size */
function pngOf(svgText, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: width * SCALE, height: height * SCALE });
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
}

/** The two exports as page actions. @param {(text: string) => void} announce */
export function chartExportActions(announce) {
  /** @returns {{ code: string, chart: SVGSVGElement } | null} */
  const target = () => {
    const file = activeFile(getState());
    const chart = document.querySelector("#chart svg");
    return file && chart instanceof SVGSVGElement ? { code: file.code, chart } : null;
  };
  return {
    exportSvg: () => {
      const at = target();
      if (!at) return;
      download(`${at.code}.svg`, chartSvg(at.chart).text, "image/svg+xml");
      announce(t("status.exported_picture", { name: `${at.code}.svg` }));
    },
    exportPng: async () => {
      const at = target();
      if (!at) return;
      const { text, width, height } = chartSvg(at.chart);
      try {
        download(`${at.code}.png`, await pngOf(text, width, height), "image/png");
        announce(t("status.exported_picture", { name: `${at.code}.png` }));
      } catch {
        announce(t("status.export_failed"));
      }
    },
  };
}
