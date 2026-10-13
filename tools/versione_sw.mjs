// Writes into site/sw.js the list of files it precaches (FILES: everything in the built site except sw.js and the library packages, which
// the worker caches by itself) and its cache version: a hash of sw.js and of those files, so the cache is renewed exactly when something it
// holds changes. No pull request edits FILES or raises a number by hand. A name in FILES that is not in the site stops the build.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const VERSION_LINE = /^const VERSION = "[^"]*";$/m;
const FILES_BLOCK = /const FILES = \[[\s\S]*?\];/;
const NOT_PRECACHED = (name) => name === "sw.js" || name.startsWith("librerie/");

/** The precache list for the files of a site (paths relative to its root): "./" and every folder served from its index.html first, then the files. */
export function precacheList(paths) {
  const files = paths.filter((p) => !NOT_PRECACHED(p)).sort();
  const folders = files.filter((p) => p.endsWith("/index.html")).map((p) => p.slice(0, -"index.html".length));
  return ["./", ...folders, ...files];
}

/** Every file under `dir`, as paths relative to it with "/" separators. */
export async function walk(dir, prefix = "") {
  const out = [];
  for (const e of await readdir(new URL(prefix, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await walk(dir, `${prefix}${e.name}/`)));
    else out.push(prefix + e.name);
  }
  return out;
}

/** Rewrites the FILES list of `source` with `files`, one per line (the list is generated: never edited by hand). */
export function withFiles(source, files) {
  if (!FILES_BLOCK.test(source)) throw new Error("sw.js: no FILES list");
  return source.replace(FILES_BLOCK, () => `const FILES = [\n${files.map((f) => `  ${JSON.stringify(f)},\n`).join("")}];`);
}

/** The names listed in `FILES` of the service worker source. */
export function listedFiles(source) {
  const m = /const FILES = \[([\s\S]*?)\];/.exec(source);
  if (!m) throw new Error("sw.js: no FILES list");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/**
 * The version for a service worker source: first 12 hex digits of the SHA-256 of the source (without its VERSION line) and of the
 * files listed in FILES, in order. Folders ("./", "pagine/x/") are served from their index.html, which is listed too.
 * @param {string} source text of sw.js
 * @param {(name: string) => Promise<Buffer>} read content of a listed file
 */
export async function computeVersion(source, read) {
  const hash = createHash("sha256");
  hash.update(source.replace(VERSION_LINE, ""));
  for (const name of listedFiles(source)) {
    if (name.endsWith("/")) continue;
    hash.update(`\0${name}\0`);
    hash.update(await read(name));
  }
  return hash.digest("hex").slice(0, 12);
}

/** Rewrites the VERSION line of `source` with `version`. */
export function withVersion(source, version) {
  if (!VERSION_LINE.test(source)) throw new Error('sw.js: no line `const VERSION = "...";`');
  return source.replace(VERSION_LINE, `const VERSION = "${version}";`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const site = new URL("../site/", import.meta.url);
  const path = new URL("sw.js", site);
  const source = withFiles(await readFile(path, "utf8"), precacheList(await walk(site)));
  const version = await computeVersion(source, (name) => readFile(new URL(name, site)));
  await writeFile(path, withVersion(source, version));
  console.log(`sw.js VERSION ${version}, ${listedFiles(source).length} precached`);
}
