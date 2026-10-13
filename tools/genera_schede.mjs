// Copies the substance sheets (data/substances/*/datasheet) into site/schede/ as one JSON bundle per substance,
// plus an index and the sources they cite. Only public data: the page loads these files on request, never anything else.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("site/schede/", root);
const SECTION = /^## ([a-z_]+)\s*$/;

/** Splits texts.<lang>.md into {section: text}. @param {string} md */
export function parseTexts(md) {
  /** @type {Record<string, string>} */
  const sections = {};
  let key = null;
  let buf = [];
  const flush = () => { if (key) sections[key] = buf.join("\n").trim(); };
  for (const line of md.split("\n")) {
    const m = SECTION.exec(line);
    if (m) { flush(); key = m[1]; buf = []; } else buf.push(line);
  }
  flush();
  return sections;
}

const json = async (url) => JSON.parse(await readFile(url, "utf8"));

async function main() {
  await mkdir(out, { recursive: true });
  const ids = (await readdir(new URL("data/substances/", root), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const sheets = [];
  for (const id of ids) {
    const dir = new URL(`data/substances/${id}/datasheet/`, root);
    let datasheet;
    try { datasheet = await json(new URL("datasheet.json", dir)); } catch { continue; }
    const substance = await json(new URL(`data/substances/${id}/substance.json`, root));
    const texts = {};
    for (const lang of ["en", "it"]) {
      try { texts[lang] = parseTexts(await readFile(new URL(`texts.${lang}.md`, dir), "utf8")); } catch { /* optional language */ }
    }
    const { version, section_state, reviewers, reviewed, review_by, ai_assisted } = datasheet;
    const names = Object.fromEntries(Object.entries(substance.names).map(([l, n]) => [l, n.preferred]));
    await writeFile(new URL(`${id}.json`, out), JSON.stringify({ id, names, version, section_state, reviewers, reviewed, review_by, ai_assisted, texts }));
    sheets.push(id);
  }
  const all = (await json(new URL("data/sources.json", root))).sources;
  const sources = Object.fromEntries(all.map((s) => [s.id, { title: s.title, ...(s.url ? { url: s.url } : {}), ...(s.doi ? { doi: s.doi } : {}), ...(s.year ? { year: s.year } : {}) }]));
  await writeFile(new URL("sources.json", out), JSON.stringify(sources));
  await writeFile(new URL("index.json", out), JSON.stringify({ schema: "sheets-index/1", sheets }));
  console.log(`schede: ${sheets.length} sheets`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
