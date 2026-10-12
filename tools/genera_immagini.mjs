// Regenerates the committed identity images in web/img/ from web/img/logo.svg and APP_NAME. Run by hand when the logo or the name changes:
//   node tools/genera_immagini.mjs      (needs the dev dependencies: npm ci)
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { APP_NAME } from "../web/appname.js";

const IMG = new URL("../web/img/", import.meta.url).pathname;
const BLUE = "#0072B2";
const AZURE = "#56B4E9";
const source = readFileSync(IMG + "logo.svg", "utf8");
const paint = (color) => source.replaceAll("currentColor", color);
const write = (name, data) => writeFileSync(IMG + name, data);

write("logo-chiaro.svg", paint(BLUE));
write("logo-scuro.svg", paint(AZURE));
write("logo-mono.svg", paint("#000000"));
// Favicon: follows the browser theme with a media query inside the SVG.
write(
  "favicon.svg",
  source.replaceAll('stroke="currentColor"', 'class="s"').replace(
    "<rect",
    `<style>.s{stroke:${BLUE}}@media (prefers-color-scheme:dark){.s{stroke:${AZURE}}}</style><rect`,
  ),
);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** Render an HTML body at the given size to a PNG buffer. */
async function shot(width, height, body) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<body style="margin:0">${body}</body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** The logo in blue on a plain background; `scale` < 1 leaves a margin (maskable icons keep the logo inside the central safe zone). */
function iconBody(size, scale, background) {
  const inner = Math.round(size * scale);
  const logo = paint(BLUE).replace("<svg ", `<svg width="${inner}" height="${inner}" `);
  return `<div style="width:${size}px;height:${size}px;background:${background};display:flex;align-items:center;justify-content:center">${logo}</div>`;
}

const sizes = {};
for (const n of [16, 32, 48]) sizes[n] = await shot(n, n, iconBody(n, 1, "#fff"));
write("icon-16.png", sizes[16]);
write("icon-32.png", sizes[32]);
write("icon-192.png", await shot(192, 192, iconBody(192, 1, "#fff")));
write("icon-512.png", await shot(512, 512, iconBody(512, 1, "#fff")));
write("apple-touch-icon.png", await shot(180, 180, iconBody(180, 0.82, "#fff")));
write("icon-maskable-192.png", await shot(192, 192, iconBody(192, 0.6, "#fff")));
write("icon-maskable-512.png", await shot(512, 512, iconBody(512, 0.6, "#fff")));

// favicon.ico: three PNG images in one container.
const entries = [16, 32, 48].map((n) => ({ n, data: sizes[n] }));
const head = Buffer.alloc(6 + 16 * entries.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(entries.length, 4);
let offset = head.length;
entries.forEach(({ n, data }, i) => {
  const at = 6 + 16 * i;
  head[at] = n;
  head[at + 1] = n;
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(data.length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += data.length;
});
write("favicon.ico", Buffer.concat([head, ...entries.map((e) => e.data)]));

// Social preview 1200x630: sober, language-neutral (name and logo only).
const logo = paint(BLUE).replace("<svg ", '<svg width="240" height="240" ');
write(
  "og.png",
  await shot(
    1200,
    630,
    `<div style="width:1200px;height:630px;background:#fff;color:#1b1e22;display:flex;align-items:center;justify-content:center;gap:56px;font-family:system-ui,'Helvetica Neue',Arial,sans-serif">${logo}<div><div style="font-size:132px;line-height:1">${APP_NAME}</div><div style="font-size:40px;margin-top:20px;color:#4a4a4a">FTIR · drug checking</div></div></div>`,
  ),
);
await browser.close();
