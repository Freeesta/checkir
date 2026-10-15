// Helper for the scenarios that need a private library with a known name: the files go in a folder with that name and are chosen
// with the folder picker of the Libraries panel; the import starts at once and the library takes the folder's name.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @param {import("playwright").Page} page @param {string} name folder (and so library) name @param {{ name: string, buffer: Buffer }[] | { name: string, buffer: Buffer }} files */
export async function importAs(page, name, files) {
  const dir = join(await mkdtemp(join(tmpdir(), "checkir-imp-")), name);
  await mkdir(dir);
  for (const f of [].concat(files)) await writeFile(join(dir, f.name), f.buffer);
  await page.setInputFiles('input[data-library="folder"]', dir);
}
