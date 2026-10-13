// @ts-check
import { APP_NAME } from "./appname.js";
import { proposedLibraryName } from "./candidati.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { attachTip } from "./tooltip.js";

/** Name typed for the next imported library; kept here so a redraw of the panel does not lose it. */
let typedName = "";
/** @type {import("./actions.js").Ctx | null} */
let current = null;
/** @type {{ files: HTMLInputElement, folder: HTMLInputElement } | null} */
let pickers = null;

/** @param {boolean} folder @returns {HTMLInputElement} */
function makePicker(folder) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  input.dataset.library = folder ? "folder" : "files";
  if (folder) input.setAttribute("webkitdirectory", "");
  else input.accept = ".jdx,.dx,.jcm,.jcamp";
  input.addEventListener("change", () => {
    const chosen = [...(input.files ?? [])];
    input.value = "";
    if (chosen.length) current?.importLibrary(chosen, typedName.trim() || proposedLibraryName(chosen) || t("library.import.name_default"));
  });
  document.body.append(input);
  return input;
}

/** The two hidden file choosers (files, folder), created on first use. */
function choosers() {
  pickers ??= { files: makePicker(false), folder: makePicker(true) };
  return pickers;
}

/** @param {import("./state.js").Notice} n @returns {string} */
function noticeText(n) {
  if (n.key !== "library.import.skipped") return t(n.key, n.params);
  const { file = "", reason_key: reason = "err.file.unreadable", ...rest } = n.params;
  return `${t("library.import.skipped", { file })} ${t(reason, rest)}`;
}

/** @param {import("./state.js").LibraryJob} job */
function progressBlock(job, /** @type {import("./actions.js").Ctx} */ ctx) {
  const text = t("library.import.progress", { done: formatNumber(job.done), total: formatNumber(job.total) });
  const bar = el("progress", { max: String(Math.max(job.total, 1)), value: String(job.done), "aria-label": text });
  const cancel = el("button", { type: "button", class: "btn", "data-fk": "lib-cancel" }, [icon("close"), t("library.import.cancel")]);
  cancel.addEventListener("click", () => ctx.cancelImport());
  return el("div", { class: "lib-progress", role: "status" }, [bar, el("span", {}, [text]), cancel]);
}

/** @param {import("./state.js").LibraryEntry} l @param {import("./actions.js").Ctx} ctx */
function libraryItem(l, ctx) {
  const check = el("input", { type: "checkbox", "data-fk": `lib-on-${l.id}`, "aria-label": t("library.item.enable", { name: l.id }) });
  check.checked = l.enabled;
  check.addEventListener("change", () => ctx.toggleLibrary(l.id, check.checked));
  const head = el("div", { class: "lib-head" }, [el("label", { class: "lib-toggle" }, [check, el("strong", {}, [l.id])]), el("span", { class: "badge" }, [t(l.private ? "library.item.private" : "library.item.public")])]);
  if (l.private) {
    const remove = el("button", { type: "button", class: "icon-button", "data-fk": `lib-rm-${l.id}`, "aria-label": t("library.item.remove", { name: l.id }) }, [icon("close")]);
    remove.addEventListener("click", () => ctx.removeLibrary(l.id));
    attachTip(remove, () => t("library.item.remove", { name: l.id }));
    head.append(remove);
  }
  const license = l.private ? t("library.item.license_private") : l.license;
  const attribution = l.private ? t("library.item.attribution_private") : ((currentLang() === "it" && l.attribution.it) || l.attribution.en);
  // Conditions of a third-party permission (licence page of the library, never in the results); {app} = product name.
  const termsText = l.terms && ((currentLang() === "it" && l.terms.it) || l.terms.en);
  const terms = termsText ? termsText.replaceAll("{app}", APP_NAME) : "";
  return el("li", { class: "lib-item", "data-library": l.id }, [
    head,
    el("span", { class: "note" }, [`${t("library.item.version", { version: l.version })} · ${t("library.item.spectra", { n: formatNumber(l.spectra) })} · ${t("library.item.license", { license })}`]),
    el("span", { class: "note" }, [t("library.item.attribution", { text: attribution })]),
    ...(terms ? [el("span", { class: "note", "data-library-terms": l.id }, [t("library.item.terms", { text: terms })])] : []),
  ]);
}

/** Section 2: the libraries (public and private), the import of a private one with progress, the notices. @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
export function renderLibraries(body, s, ctx) {
  current = ctx;
  const busy = Boolean(s.libraryJob);
  const pick = choosers();
  const files = el("button", { type: "button", class: "btn", "data-fk": "lib-import-files" }, [icon("file"), t("library.import.files")]);
  const folder = el("button", { type: "button", class: "btn", "data-fk": "lib-import-folder" }, [icon("library"), t("library.import.folder")]);
  files.disabled = folder.disabled = busy;
  files.addEventListener("click", () => pick.files.click());
  folder.addEventListener("click", () => pick.folder.click());
  const name = el("input", { type: "text", id: "lib-name", class: "lib-name", maxlength: "60", autocomplete: "off", placeholder: t("library.import.name_placeholder") });
  name.value = typedName;
  name.addEventListener("input", () => (typedName = name.value));
  body.append(
    el("div", { class: "row" }, [files, folder]),
    el("label", { for: "lib-name", class: "note" }, [t("library.import.name_label")]),
    name,
    el("p", { class: "note" }, [icon("lock"), t("library.import.private_note")]),
  );
  if (s.libraryJob) body.append(progressBlock(s.libraryJob, ctx));
  if (s.libraryNotices.length) body.append(el("div", { role: "status" }, [el("ul", { class: "notes" }, s.libraryNotices.map((n) => el("li", {}, [noticeText(n)])))]));
  if (!s.libraries.length) return body.append(el("p", { class: "empty" }, [t("panel.libraries.empty")]));
  body.append(el("ul", { class: "libs" }, s.libraries.map((l) => libraryItem(l, ctx))));
}
