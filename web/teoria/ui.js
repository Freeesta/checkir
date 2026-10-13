// @ts-check
// Small controls shared by the interactive figures: a labelled range with its value, a group of choice buttons.
import { el } from "../dom.js";

let counter = 0;

/**
 * A labelled range input; `format` writes the value next to it.
 * @param {{ label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void }} o
 * @returns {{ row: HTMLElement, input: HTMLInputElement, setLabel: (text: string) => void, set: (v: number) => void }}
 */
export function slider(o) {
  counter += 1;
  const id = `rng${counter}`;
  const text = el("label", { for: id }, [o.label]);
  const input = el("input", { type: "range", id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value) });
  const out = el("output", { for: id, class: "range-value" }, [o.format(o.value)]);
  const sync = () => {
    out.textContent = o.format(Number(input.value));
  };
  input.addEventListener("input", () => {
    sync();
    o.onInput(Number(input.value));
  });
  return {
    row: el("div", { class: "range-row" }, [text, input, out]),
    input,
    setLabel: (s) => {
      text.textContent = s;
    },
    set: (v) => {
      input.value = String(v);
      sync();
    },
  };
}

/**
 * A group of exclusive choices as buttons with `aria-pressed` (arrow keys are not needed: each one is a tab stop).
 * @param {string} legend
 * @param {Array<{ id: string, label: string }>} choices
 * @param {string} current
 * @param {(id: string) => void} onChoose
 * @returns {{ group: HTMLElement, set: (id: string) => void, relabel: (labels: Array<{ id: string, label: string }>, legend: string) => void }}
 */
export function choice(legend, choices, current, onChoose) {
  const caption = el("legend", {}, [legend]);
  const group = el("fieldset", { class: "choice" }, [caption]);
  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map();
  /** @param {string} id */
  const set = (id) => {
    for (const [k, b] of buttons) b.setAttribute("aria-pressed", String(k === id));
  };
  for (const c of choices) {
    const b = el("button", { type: "button", class: "btn", "aria-pressed": "false" }, [c.label]);
    b.addEventListener("click", () => {
      set(c.id);
      onChoose(c.id);
    });
    buttons.set(c.id, b);
    group.append(b);
  }
  set(current);
  return {
    group,
    set,
    relabel(labels, legendText) {
      caption.textContent = legendText;
      for (const l of labels) {
        const b = buttons.get(l.id);
        if (b) b.textContent = l.label;
      }
    },
  };
}

/**
 * A table from header, rows and caption.
 * @param {string} caption @param {string[]} columns @param {string[][]} rows
 * @returns {HTMLTableElement}
 */
export function table(caption, columns, rows) {
  const t = el("table", { class: "data" }, [el("caption", {}, [caption])]);
  t.append(el("thead", {}, [el("tr", {}, columns.map((c) => el("th", { scope: "col" }, [c])))]));
  t.append(el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => (i === 0 ? el("th", { scope: "row" }, [c]) : el("td", {}, [c])))))));
  return t;
}
