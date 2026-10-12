// Writes site/manifest.webmanifest from web/appname.js, so the product name is never typed anywhere else.
import { writeFile } from "node:fs/promises";
import { APP_NAME } from "../web/appname.js";

const manifest = {
  name: APP_NAME,
  short_name: APP_NAME,
  start_url: ".",
  scope: ".",
  display: "standalone",
  icons: [192, 512].map((n) => ({ src: `img/icon-${n}.png`, sizes: `${n}x${n}`, type: "image/png" })),
};
await writeFile(new URL("../site/manifest.webmanifest", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
