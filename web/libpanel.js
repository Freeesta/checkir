// @ts-check
import { APP_NAME } from "./appname.js";
import { proposedLibraryName } from "./candidati.js";
import { classify } from "./importa.js";
import { el, icon } from "./dom.js";
import { currentLang, formatNumber, t } from "./i18n.js";
import { attachTip } from "./tooltip.js";

/** The library being renamed and what is typed so far; kept here so a redraw of the panel does not close the field. */
let renaming = { id: "", text: "" };
/** @type {import("./actions.js").Ctx | null} */
let current = null;
/** @type {{ files: HTMLInputElement, folder: HTMLInputElement } | null} */
let pickers = null;

/** Import what was chosen, as its content says: packages, a Shimadzu library or spectra; no question is asked. @param {File[]} chosen */
async function importChosen(chosen) {
  const { kind, files } = await classify(chosen);
  if (kind === "packages") current?.importPackages(files);
  else current?.importLibrary(files, proposedLibraryName(files) || t("library.import.name_default"), "unknown");
}

/** @param {"files" | "folder"} kind the files of a library or of a package (several choices), or a folder @returns {HTMLInputElement} */
function makePicker(kind) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  input.dataset.library = kind;
  if (kind === "folder") input.setAttribute("webkitdirectory", "");
  input.addEventListener("change", () => {
    const chosen = [...(input.files ?? [])];
    input.value = "";
    if (chosen.length) void importChosen(chosen);
  });
  document.body.append(input);
  return input;
}

/** The hidden file choosers, created on first use. */
function choosers() {
  pickers ??= { files: makePicker("files"), folder: makePicker("folder") };
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

/** Edit the name of a private library in place: Enter or leaving the field saves it, Esc keeps the old one. @param {HTMLElement} head @param {import("./state.js").LibraryEntry} l @param {import("./actions.js").Ctx} ctx */
function startRename(head, l, ctx, restoring = false) {
  // A double click can land on a node the panel has just replaced: use the one on the page.
  if (!head.isConnected && !restoring) head = /** @type {HTMLElement | null} */ (document.querySelector(`[data-library="${CSS.escape(l.id)}"] .lib-head`)) ?? head;
  if (head.parentElement?.querySelector(".lib-rename")) return;
  const fresh = renaming.id !== l.id;
  if (fresh) renaming = { id: l.id, text: l.label };
  const input = el("input", { type: "text", class: "lib-rename", maxlength: "60", autocomplete: "off", "data-fk": `lib-name-${l.id}`, "aria-label": t("library.item.rename_label", { name: l.label }) });
  input.value = renaming.text;
  input.addEventListener("input", () => (renaming.text = input.value));
  let settled = false;
  const finish = (/** @type {boolean} */ save) => {
    if (settled) return;
    settled = true;
    renaming = { id: "", text: "" };
    if (save) ctx.renameLibrary(l.id, input.value);
    input.remove();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  // A redraw of the panel removes the field (and blurs it): only a field still on the page saves.
  input.addEventListener("blur", () => queueMicrotask(() => input.isConnected && finish(true)));
  head.after(input);
  queueMicrotask(() => {
    input.focus();
    if (fresh) input.select();
  });
}

/** What the list does not show: version, spectra, source, licence and its conditions ({app} = product name). @param {import("./state.js").LibraryEntry} l @returns {string} */
function libraryInfo(l) {
  const license = l.private ? t("library.item.license_private") : l.license;
  const attribution = l.private ? t("library.item.attribution_private") : ((currentLang() === "it" && l.attribution.it) || l.attribution.en);
  const termsText = l.terms && ((currentLang() === "it" && l.terms.it) || l.terms.en);
  const terms = termsText ? t("library.item.terms", { text: termsText.replaceAll("{app}", APP_NAME) }) : "";
  return [`${t("library.item.version", { version: l.version })} · ${t("library.item.spectra", { n: formatNumber(l.spectra) })} · ${t("library.item.license", { license })}`, t("library.item.attribution", { text: attribution }), terms].filter(Boolean).join("\n");
}

/** @param {import("./state.js").LibraryEntry} l @param {import("./actions.js").Ctx} ctx */
function libraryItem(l, ctx) {
  const infoId = `lib-info-${l.id}`;
  const info = libraryInfo(l);
  const check = el("input", { type: "checkbox", "data-fk": `lib-on-${l.id}`, "aria-label": t("library.item.enable", { name: l.label }), "aria-describedby": infoId });
  check.checked = l.enabled;
  check.addEventListener("change", () => ctx.toggleLibrary(l.id, check.checked));
  const name = el("strong", {}, [l.label]);
  const toggle = el("label", { class: "lib-toggle" }, [check, name]);
  // The tip takes the description of the box while it shows: put the permanent one back after it hides.
  const restore = () => setTimeout(() => check.setAttribute("aria-describedby", infoId), 250);
  check.addEventListener("blur", restore);
  check.addEventListener("mouseleave", restore);
  attachTip(name, () => info);
  attachTip(check, () => info);
  const head = el("div", { class: "lib-head" }, [toggle, el("span", { class: "visually-hidden", id: infoId, "data-library-terms": l.id }, [info])]);
  if (l.private) {
    const remove = el("button", { type: "button", class: "icon-button", "data-fk": `lib-rm-${l.id}`, "aria-label": t("library.item.remove", { name: l.label }) }, [icon("close")]);
    remove.addEventListener("click", () => ctx.removeLibrary(l.id));
    attachTip(remove, () => t("library.item.remove", { name: l.label }));
    const rename = el("button", { type: "button", class: "icon-button", "data-fk": `lib-rename-${l.id}`, "aria-label": t("library.item.rename", { name: l.label }) }, [icon("pen")]);
    rename.addEventListener("click", () => startRename(head, l, ctx));
    attachTip(rename, () => t("library.item.rename", { name: l.label }));
    name.addEventListener("dblclick", () => startRename(head, l, ctx));
    head.append(rename, remove);
  }
  const item = el("li", { class: "lib-item", "data-library": l.id }, [head]);
  if (renaming.id === l.id) startRename(head, l, ctx, true);
  return item;
}

/** Section 2: the libraries (public and private), the import of a private one with progress, the notices. @param {HTMLElement} body @param {import("./state.js").AppState} s @param {import("./actions.js").Ctx} ctx */
export function renderLibraries(body, s, ctx) {
  current = ctx;
  const busy = Boolean(s.libraryJob);
  const pick = choosers();
  const files = el("button", { type: "button", class: "btn", "data-fk": "lib-import-files", "aria-label": t("library.import.pick_files_tip") }, [icon("file"), t("library.import.pick_files")]);
  const folder = el("button", { type: "button", class: "btn", "data-fk": "lib-import-folder", "aria-label": t("library.import.pick_folder_tip") }, [icon("library"), t("library.import.pick_folder")]);
  files.disabled = folder.disabled = busy;
  files.addEventListener("click", () => pick.files.click());
  folder.addEventListener("click", () => pick.folder.click());
  attachTip(files, () => t("library.import.pick_files_tip"));
  attachTip(folder, () => t("library.import.pick_folder_tip"));
  body.append(el("div", { class: "row" }, [files, folder]));
  if (s.libraryJob) body.append(progressBlock(s.libraryJob, ctx));
  if (s.libraryNotices.length) body.append(el("div", { role: "status" }, [el("ul", { class: "notes" }, s.libraryNotices.map((n) => el("li", {}, [noticeText(n)])))]));
  if (!s.libraries.length) return body.append(el("p", { class: "empty" }, [t("panel.libraries.empty")]));
  body.append(el("ul", { class: "libs" }, s.libraries.map((l) => libraryItem(l, ctx))));
}
