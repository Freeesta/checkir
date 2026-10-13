// T1 (static, no browser): the CSP of index.html is exactly the expected one, and web/ contains no URL that the browser
// could load (only the textual links listed in link_ammessi.json). Negative controls prove that the checks can fail.
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const WEB = new URL("../web/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;

/** The CSP of rule R1: same origin only, no third party, no inline script or style. */
export const EXPECTED_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const URL_RE = /(?:https?:)?\/\/[^\s"'<>)\\]+/g;
const LOADERS = /(?:\b(?:src|href|action|poster|data)\s*=\s*["']?\s*\/\/)|@import|url\(\s*["']?(?:https?:)?\/\/|\bimport\s*\(\s*["']https?:/;
const FORBIDDEN_API = /navigator\s*\.\s*sendBeacon|new\s+WebSocket|new\s+EventSource|XMLHttpRequest/;
const TEXT_EXT = /\.(html|js|mjs|css|json|svg|webmanifest|txt|md)$/;

/** The content of the CSP meta tag, or null. */
export function cspOf(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
  return m ? m[1] : null;
}

/** Problems of one file: URLs not listed for it, loaders of remote resources, forbidden network APIs. */
export function fileProblems(name, text, allowed) {
  const out = [];
  const listed = new Set(allowed.filter((a) => a.file === name).map((a) => a.url));
  for (const url of new Set(text.match(URL_RE) ?? [])) {
    if (!listed.has(url)) out.push(`${name}: URL not in link_ammessi.json: ${url}`);
  }
  if (LOADERS.test(text)) out.push(`${name}: loads a remote or protocol-relative resource`);
  if (name.endsWith(".js") && FORBIDDEN_API.test(text)) out.push(`${name}: forbidden network API (beacon, socket, event source, XHR)`);
  return out;
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (TEXT_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/** Every problem of the real web/ directory (empty list = T1 green). */
export async function webProblems() {
  const allowed = JSON.parse(await readFile(new URL("./link_ammessi.json", import.meta.url), "utf8")).links;
  const problems = [];
  const csp = cspOf(await readFile(join(WEB, "index.html"), "utf8"));
  if (csp !== EXPECTED_CSP) problems.push(`index.html: CSP differs from rule R1: ${csp}`);
  for (const file of await walk(WEB)) {
    const name = "web/" + relative(WEB, file);
    problems.push(...fileProblems(name, await readFile(file, "utf8"), allowed));
  }
  for (const a of allowed) {
    const text = await readFile(join(ROOT, a.file), "utf8").catch(() => "");
    if (!text.includes(a.url)) problems.push(`link_ammessi.json: stale entry ${a.file} ${a.url}`);
  }
  return problems;
}

export async function staticScenario(check) {
  const real = await webProblems();
  check("T1: CSP exact, no remote URL or network API in web/", real.length === 0, real.join(" | "));
  check("T1 control: a remote font fails", fileProblems("web/style.css", '@import url("https://fonts.example/f.css");', []).length > 0);
  check("T1 control: a protocol-relative script fails", fileProblems("web/index.html", '<script src="//cdn.example/x.js"></script>', []).length > 0);
  check("T1 control: a beacon fails", fileProblems("web/main.js", 'navigator.sendBeacon("/x");', []).length > 0);
  check("T1 control: a listed link passes", fileProblems("web/a.js", 'const u = "https://x.example/";', [{ file: "web/a.js", url: "https://x.example/" }]).length === 0);
  check("T1 control: a looser CSP is not the expected one", cspOf(`<meta http-equiv="Content-Security-Policy" content="${EXPECTED_CSP}; font-src https://f.example">`) !== EXPECTED_CSP);
}
