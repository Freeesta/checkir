// Writes the generated identity files into site/ so the product name and the site address are never typed outside web/appname.js:
// manifest.webmanifest, and index.html with its %APP_NAME%, %SITE_URL% and %DESCRIPTION% placeholders filled
// (crawlers of social networks and chats do not run scripts, so the preview meta tags must be in the served HTML).
import { readFile, writeFile } from "node:fs/promises";
import { APP_NAME, SITE_URL } from "../web/appname.js";

const THEME = { light: "#ffffff", dark: "#121417" };
const site = (name) => new URL(`../site/${name}`, import.meta.url);
const it = JSON.parse(await readFile(new URL("../web/lang/it.json", import.meta.url), "utf8"));

const manifest = {
  name: APP_NAME,
  short_name: APP_NAME,
  start_url: ".",
  scope: ".",
  display: "standalone",
  theme_color: THEME.light,
  background_color: THEME.light,
  icons: [
    ...[192, 512].map((n) => ({ src: `img/icon-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" })),
    ...[192, 512].map((n) => ({ src: `img/icon-maskable-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "maskable" })),
  ],
};
await writeFile(site("manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

const escape = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const values = { "%APP_NAME%": APP_NAME, "%SITE_URL%": SITE_URL, "%DESCRIPTION%": it["share.description"] };
let html = await readFile(site("index.html"), "utf8");
for (const [key, value] of Object.entries(values)) html = html.replaceAll(key, escape(value));
if (/%[A-Z_]+%/.test(html)) throw new Error("unfilled placeholder in index.html");
await writeFile(site("index.html"), html);
