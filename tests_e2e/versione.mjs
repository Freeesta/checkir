// Cache version of the service worker (tools/versione_sw.mjs): a hash of sw.js and of the files it precaches. Pure controls plus the built site.
import { readFile } from "node:fs/promises";
import { computeVersion, listedFiles, precacheList, withFiles, withVersion } from "../tools/versione_sw.mjs";

const SW = 'const VERSION = "x";\nconst FILES = [\n  "./", "a.js", "dir/", "dir/index.html",\n];\n';

export async function versionScenario(check) {
  const files = { "a.js": "one", "dir/index.html": "two" };
  const read = async (name) => {
    if (!(name in files)) throw new Error(`missing ${name}`);
    return Buffer.from(files[name]);
  };
  check("version: FILES is read, folders included", listedFiles(SW).join() === "./,a.js,dir/,dir/index.html");
  const v1 = await computeVersion(SW, read);
  check("version: 12 hex digits, stable for the same content", /^[0-9a-f]{12}$/.test(v1) && v1 === (await computeVersion(SW, read)));
  check("version: it does not depend on the VERSION line itself", v1 === (await computeVersion(withVersion(SW, "other"), read)));
  files["a.js"] = "changed";
  check("version: a changed file changes it", v1 !== (await computeVersion(SW, read)));
  files["a.js"] = "one";
  check("version: a changed FILES list changes it", v1 !== (await computeVersion(SW.replace('"a.js", ', ""), read)));
  const list = precacheList(["sw.js", "index.html", "b.js", "pagine/x/index.html", "librerie/libraries.json", "librerie/a/data.bin"]);
  check("precache: folders first, sw.js and librerie/ left out", list.join() === "./,pagine/x/,b.js,index.html,pagine/x/index.html", list.join());
  const rewritten = withFiles("const FILES = []; // x\nconst Y = 1;", list);
  check("precache: the generated list is read back as written", listedFiles(rewritten).join() === list.join() && rewritten.includes("const Y = 1;"));
  let failed = false;
  await computeVersion(SW.replace('"a.js"', '"gone.js"'), read).catch(() => (failed = true));
  check("version: a listed file that is not in the site stops the build", failed);
  const site = new URL("../site/", import.meta.url);
  const built = await readFile(new URL("sw.js", site), "utf8");
  const written = /^const VERSION = "([^"]*)";$/m.exec(built)?.[1];
  check("precache: the built sw.js lists the page, its folders and the wasm", ["./", "index.html", "main.js", "pagine/informativa/", "wasm/ftir_wasm_bg.wasm"].every((n) => listedFiles(built).includes(n)));
  check("version: the built sw.js carries the hash of its own files", written === (await computeVersion(built, (n) => readFile(new URL(n, site)))), String(written));
}
