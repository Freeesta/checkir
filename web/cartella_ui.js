// @ts-check
import { el, icon } from "./dom.js";
import { t } from "./i18n.js";

/**
 * @param {string} key @param {string} label @param {boolean} on @param {(on: boolean) => void} change
 * @returns {HTMLElement}
 */
function checkbox(key, label, on, change) {
  const input = el("input", { type: "checkbox", id: `folder-${key}`, "data-fk": `folder-${key}` });
  input.checked = on;
  input.addEventListener("change", () => change(input.checked));
  return el("div", { class: "switch-row" }, [input, el("label", { for: input.id }, [label])]);
}

/** @param {string} text @param {string} fk @param {() => void} run @param {string} [iconId] @param {string} [label] */
function button(text, fk, run, iconId, label) {
  const b = el("button", { type: "button", class: "btn", "data-fk": fk, id: fk }, iconId ? [icon(iconId), text] : [text]);
  if (label) b.setAttribute("aria-label", label);
  b.addEventListener("click", run);
  return b;
}

/** The measurements that arrived and wait for an answer: the program proposes, the person decides. @param {import("./state.js").FolderState} f @param {import("./actions.js").FolderCtx} folder */
function offerList(f, folder) {
  const list = el("ul", { class: "files folder-offers", "aria-label": t("folder.offers_label") });
  for (const o of f.offers) {
    const row = el("div", { class: "file-row" }, [el("span", { class: "folder-offer" }, [t("folder.offer", { name: o.name })])]);
    row.append(button(t("folder.open"), `offer-open-${o.id}`, () => folder.openOffer(o.id), "file", t("folder.open_one", { name: o.name })));
    row.append(button(t("folder.ignore"), `offer-ignore-${o.id}`, () => folder.ignoreOffer(o.id), "close", t("folder.ignore_one", { name: o.name })));
    list.append(el("li", {}, [row]));
  }
  return list;
}

/** What to show while no folder is watched. @param {import("./state.js").FolderState} f @param {import("./actions.js").FolderCtx} folder @returns {HTMLElement} */
function idleRow(f, folder) {
  const row = el("div", { class: "row" }, [button(t("folder.choose"), "folder-choose", () => folder.choose(), "upload")]);
  if (f.saved) row.append(button(t("folder.resume", { name: f.saved }), "folder-resume", () => folder.resume(), "upload"));
  return row;
}

/**
 * The "instrument" block of section 1: watch the folder the instrument software saves to (Chrome/Edge), or, elsewhere, open the latest measurement of a chosen folder.
 * @param {HTMLElement} body @param {import("./state.js").FolderState} f @param {import("./actions.js").FolderCtx} folder
 */
export function renderFolder(body, f, folder) {
  const box = el("fieldset", { class: "folder" }, [el("legend", {}, [t("folder.title")])]);
  if (!f.supported) {
    box.append(el("p", { class: "note" }, [t("folder.unsupported")]), el("div", { class: "row" }, [button(t("folder.last"), "folder-last", () => folder.pickLast(), "upload")]));
  } else {
    box.append(el("p", { class: "note" }, [t("folder.intro")]));
    if (f.watching) {
      box.append(el("p", {}, [t("folder.watching", { name: f.folderName ?? "" })]), el("div", { class: "row" }, [button(t("folder.stop"), "folder-stop", () => folder.stop(), "close")]));
    } else box.append(idleRow(f, folder));
    box.append(checkbox("remember", t("folder.remember"), f.remember, (on) => folder.setRemember(on)), checkbox("auto", t("folder.auto"), f.auto, (on) => folder.setAuto(on)));
    if (f.offers.length) box.append(offerList(f, folder));
  }
  if (f.notice) box.append(el("p", { class: "error", role: "alert" }, [icon("warning"), t(f.notice.key, f.notice.params)]));
  box.append(el("p", { class: "note" }, [t("folder.limits")]));
  body.append(box);
}
