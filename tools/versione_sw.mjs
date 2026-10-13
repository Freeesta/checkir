// Writes into site/sw.js the cache version of the service worker: a hash of sw.js and of every file it precaches (FILES), computed on the
// built site, so the cache is renewed exactly when something it holds changes and no pull request has to raise a number by hand.
// A name in FILES that is not in the site stops the build (the service worker install would fail for everybody).
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const VERSION_LINE = /^const VERSION = "[^"]*";$/m;

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
  const source = await readFile(path, "utf8");
  const version = await computeVersion(source, (name) => readFile(new URL(name, site)));
  await writeFile(path, withVersion(source, version));
  console.log(`sw.js VERSION ${version}`);
}
