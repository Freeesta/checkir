// @ts-check
export const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Icon from the sprite `icons.svg`; decorative (the button around it carries the accessible name).
 * @param {string} id
 * @returns {SVGSVGElement}
 */
export function icon(id) {
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVG_NS, "svg"));
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `icons.svg#${id}`);
  svg.append(use);
  return svg;
}

/** Point an existing icon at another sprite symbol. @param {Element} svg @param {string} id */
export function setIcon(svg, id) {
  svg.querySelector("use")?.setAttribute("href", `icons.svg#${id}`);
}

/**
 * Small element builder.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string>} [attrs]
 * @param {Array<Node | string>} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/**
 * Run `render` and give the focus back to the element with the same `data-fk` if the focused one was rebuilt.
 * @param {HTMLElement} container
 * @param {() => void} render
 */
export function keepFocus(container, render) {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset.fk : undefined;
  render();
  if (key) /** @type {HTMLElement | null} */ (container.querySelector(`[data-fk="${key}"]`))?.focus();
}
