// Static server of the built site (site/) for the browser tests; a folder serves its index.html like GitHub Pages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;
const TIPI = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };

/** Starts the server on a free local port; `base` ends with a slash. */
export async function startSite() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const rel = normalize(url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    try {
      res.setHeader("Content-Type", TIPI[extname(rel)] ?? "application/octet-stream");
      res.end(await readFile(join(SITE, rel)));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}
